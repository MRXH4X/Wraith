#!/bin/bash
# Wraith - Uninstaller (macOS / Linux)
#
# Leallitja es visszabontja mindazt, amit install.sh/install-linux.sh/install-macos.sh
# letrehozott: systemd --user unitok (Linux) / launchd agentek (macOS), elo tmux
# session-ok, ugynok-worker konfig-mappak (~/.<agent>-worker), a Wraith altal
# seedelt skillek/utemezett-feladatok/bumblebee-katalogus a ~/.claude/ alatt,
# a channel-state mappa, es a install-linux.sh altal a ~/.claude/settings.json-ba
# irt egyetlen kulcs. A store/ (SQLite DB, Vault, dashboard-token) es maga a
# klon-konyvtar torlese kulon, explicit megerositest igenyel.
#
# Hasznalat:
#   ./uninstall.sh              interaktiv: eloszor terv, utana "TOROL" beirasaval megerosites
#   ./uninstall.sh --dry-run    csak a tervet irja ki, semmit nem valtoztat
#   ./uninstall.sh --yes        nem kerdez, azonnal vegrehajtja a teljes tervet
#   ./uninstall.sh --keep-data  a store/ (memoria, kanban, vault) es a klon-konyvtar
#                               NEM torlodik -- csak a szolgaltatasok/OS-integraciok
#                               allnak le, ujratelepiteskor a regi adat visszaall
#   ./uninstall.sh --purge-ollama
#                               az ollama.service is leallitasra/tiltasra kerul
#                               (a binaris/modell-adatok torlese NEM automatikus --
#                               lasd a script vegi utmutatot)

set -e

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
ORANGE='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

ok() { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${ORANGE}!${NC} $*"; }
skip() { echo -e "  ${DIM}-${NC} $*"; }

YES=0
KEEP_DATA=0
PURGE_OLLAMA=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --keep-data) KEEP_DATA=1 ;;
    --purge-ollama) PURGE_OLLAMA=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --help|-h)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
OS="$(uname -s)"

# Biztonsagi kapu: csak akkor engedjuk a klon-konyvtar torleset a script vegen,
# ha ez tenyleg egy Wraith-klon (nem $HOME, nem "/", es van benne package.json
# "name": "wraith" bejegyzessel).
IS_WRAITH_CLONE=0
if [ -f "$INSTALL_DIR/package.json" ] && grep -q '"name": "wraith"' "$INSTALL_DIR/package.json" 2>/dev/null \
   && [ "$INSTALL_DIR" != "$HOME" ] && [ "$INSTALL_DIR" != "/" ]; then
  IS_WRAITH_CLONE=1
fi

# .env-et grep-eljuk, nem source-oljuk (lasd scripts/stop.sh: igy egy tetszoleges
# ertek nem tud shell-kodkent lefutni).
SLUG="wraith"
SERVICE_ID=""
CHANNEL_PROVIDER="telegram"
if [ -f "$INSTALL_DIR/.env" ]; then
  v="$(grep -E '^MAIN_AGENT_ID=' "$INSTALL_DIR/.env" | head -1 | cut -d= -f2-)"; [ -n "$v" ] && SLUG="$v"
  v="$(grep -E '^SERVICE_ID=' "$INSTALL_DIR/.env" | head -1 | cut -d= -f2-)"; [ -n "$v" ] && SERVICE_ID="$v"
  v="$(grep -E '^CHANNEL_PROVIDER=' "$INSTALL_DIR/.env" | head -1 | cut -d= -f2-)"; [ -n "$v" ] && CHANNEL_PROVIDER="$v"
fi
SERVICE_ID="${SERVICE_ID:-$SLUG}"

# Ugynok-azonositok: agents/ alkonyvtarai + elo "agent-*" tmux session-ok neve,
# mindig beleertve a fo-ugynokot (SLUG) is -- igy azok a worker-mappak is
# megtalalhatok, amiknek mar nincs se konyvtaruk se elo session-juk torolve
# kozben elfelejtett esetben, es azok is, amik meg csak tmux-ban futnak.
AGENT_IDS=("$SLUG")
if [ -d "$INSTALL_DIR/agents" ]; then
  for d in "$INSTALL_DIR/agents"/*/; do
    [ -d "$d" ] || continue
    AGENT_IDS+=("$(basename "$d")")
  done
fi
while IFS= read -r sess; do
  [ -n "$sess" ] && AGENT_IDS+=("${sess#agent-}")
done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^agent-' || true)
# dedup
mapfile -t AGENT_IDS < <(printf '%s\n' "${AGENT_IDS[@]}" | sort -u)

# --- Terv osszeallitasa: csak azt listazzuk, ami tenyleg letezik ---

SYSTEMD_UNITS_FOUND=()
if [ "$OS" = "Linux" ]; then
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  for u in "${SERVICE_ID}-dashboard.service" "${SERVICE_ID}-channels.service" \
           "${SERVICE_ID}-morning.timer" "${SERVICE_ID}-host-watchdog.service"; do
    [ -f "$SYSTEMD_DIR/$u" ] && SYSTEMD_UNITS_FOUND+=("$u")
  done
fi

LAUNCHD_PLISTS_FOUND=()
if [ "$OS" = "Darwin" ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  for p in "com.${SERVICE_ID}.dashboard.plist" "com.${SERVICE_ID}.channels.plist"; do
    [ -f "$PLIST_DIR/$p" ] && LAUNCHD_PLISTS_FOUND+=("$p")
  done
fi

TMUX_SESSIONS_FOUND=()
if command -v tmux &>/dev/null; then
  for s in "${SLUG}-channels" "monitor"; do
    tmux has-session -t "$s" 2>/dev/null && TMUX_SESSIONS_FOUND+=("$s")
  done
  for id in "${AGENT_IDS[@]}"; do
    tmux has-session -t "agent-$id" 2>/dev/null && TMUX_SESSIONS_FOUND+=("agent-$id")
  done
fi

WORKER_DIRS_FOUND=()
for id in "${AGENT_IDS[@]}"; do
  [ -d "$HOME/.${id}-worker" ] && WORKER_DIRS_FOUND+=("$HOME/.${id}-worker")
  [ -d "$HOME/.${id}-worker-fast" ] && WORKER_DIRS_FOUND+=("$HOME/.${id}-worker-fast")
done

# Csak a Wraith sajat seed-skills/ listajaban szereplo neveket toroljuk a
# ~/.claude/skills/ alol -- egy nem-Wraith skill soha nem kerulhet a listara,
# mert csak a nevek egyeznek, a tartalmat nem erintjuk mashogy.
SKILL_DIRS_FOUND=()
if [ -d "$INSTALL_DIR/seed-skills" ]; then
  for d in "$INSTALL_DIR/seed-skills"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    [ -d "$HOME/.claude/skills/$name" ] && SKILL_DIRS_FOUND+=("$HOME/.claude/skills/$name")
  done
fi

SCHED_DIRS_FOUND=()
for src in "$INSTALL_DIR/seed-scheduled-tasks" "$INSTALL_DIR/templates/scheduled-tasks"; do
  [ -d "$src" ] || continue
  for d in "$src"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    target="$HOME/.claude/scheduled-tasks/$name"
    if [ -d "$target" ]; then
      already=0
      for existing in "${SCHED_DIRS_FOUND[@]:-}"; do [ "$existing" = "$target" ] && already=1; done
      [ "$already" = "0" ] && SCHED_DIRS_FOUND+=("$target")
    fi
  done
done

BB_DIR="$HOME/.claude/tools/bumblebee-threat-intel"
[ -d "$BB_DIR" ] && BB_FOUND=1 || BB_FOUND=0

CHANNEL_DIR="$HOME/.claude/channels/$CHANNEL_PROVIDER"
[ -d "$CHANNEL_DIR" ] && CHANNEL_FOUND=1 || CHANNEL_FOUND=0

SETTINGS_FILE="$HOME/.claude/settings.json"
SETTINGS_HAS_FLAG=0
if [ -f "$SETTINGS_FILE" ] && grep -q '"skipDangerousModePermissionPrompt"' "$SETTINGS_FILE" 2>/dev/null; then
  SETTINGS_HAS_FLAG=1
fi

STORE_SIZE=""
[ -d "$INSTALL_DIR/store" ] && STORE_SIZE="$(du -sh "$INSTALL_DIR/store" 2>/dev/null | cut -f1)"

# --- Terv kiirasa ---

echo ""
echo -e "${BOLD}Wraith uninstall -- terv (${SLUG}${SERVICE_ID:+, service: $SERVICE_ID})${NC}"
echo ""

if [ "${#SYSTEMD_UNITS_FOUND[@]}" -gt 0 ]; then
  echo "systemd --user unitok (stop + disable + torles):"
  for u in "${SYSTEMD_UNITS_FOUND[@]}"; do echo "  - $u"; done
elif [ "${#LAUNCHD_PLISTS_FOUND[@]}" -gt 0 ]; then
  echo "launchd agentek (unload + torles):"
  for p in "${LAUNCHD_PLISTS_FOUND[@]}"; do echo "  - $p"; done
else
  skip "nincs futo systemd/launchd egyseg ehhez a telepiteshez"
fi

if [ "${#TMUX_SESSIONS_FOUND[@]}" -gt 0 ]; then
  echo "elo tmux session-ok (kill):"
  for s in "${TMUX_SESSIONS_FOUND[@]}"; do echo "  - $s"; done
else
  skip "nincs elo tmux session"
fi

if [ "${#WORKER_DIRS_FOUND[@]}" -gt 0 ]; then
  echo "ugynok-worker konfig-mappak (torles, ~/):"
  for d in "${WORKER_DIRS_FOUND[@]}"; do echo "  - $d"; done
else
  skip "nincs worker konfig-mappa"
fi

if [ "${#SKILL_DIRS_FOUND[@]}" -gt 0 ]; then
  echo "seedelt skillek (torles, ~/.claude/skills/):"
  for d in "${SKILL_DIRS_FOUND[@]}"; do echo "  - $(basename "$d")"; done
else
  skip "nincs seedelt skill ~/.claude/skills/ alatt"
fi

if [ "${#SCHED_DIRS_FOUND[@]}" -gt 0 ]; then
  echo "seedelt utemezett feladatok (torles, ~/.claude/scheduled-tasks/):"
  for d in "${SCHED_DIRS_FOUND[@]}"; do echo "  - $(basename "$d")"; done
else
  skip "nincs seedelt utemezett feladat ~/.claude/scheduled-tasks/ alatt"
fi

if [ "$BB_FOUND" = "1" ]; then
  echo "bumblebee threat-intel katalogus: $BB_DIR"
else
  skip "nincs bumblebee threat-intel katalogus"
fi

if [ "$CHANNEL_FOUND" = "1" ]; then
  echo "channel-state mappa: $CHANNEL_DIR"
else
  skip "nincs channel-state mappa ($CHANNEL_PROVIDER)"
fi

if [ "$SETTINGS_HAS_FLAG" = "1" ]; then
  echo "~/.claude/settings.json: a \"skipDangerousModePermissionPrompt\" kulcs torlese (a tobbi beallitas erintetlen)"
else
  skip "~/.claude/settings.json nem tartalmazza a Wraith altal irt kulcsot"
fi

echo ""
echo -e "${DIM}~/.claude.json-t (onboarding/theme) szandekosan nem bantjuk -- azt mas Claude Code projektek is hasznaljak.${NC}"

echo ""
if [ "$KEEP_DATA" = "1" ]; then
  warn "MEGTARTVA (--keep-data): $INSTALL_DIR (store/ -- memoria, kanban, Vault${STORE_SIZE:+, jelenleg $STORE_SIZE}), .env"
else
  echo -e "${RED}VEGLEGESEN TOROLVE:${NC} $INSTALL_DIR"
  echo -e "  ${DIM}(benne a store/ -- memoria, kanban, Vault titkositott tartalma${STORE_SIZE:+, jelenleg $STORE_SIZE} -- es a .env)${NC}"
fi

if [ "$PURGE_OLLAMA" = "1" ]; then
  echo -e "${RED}ollama${NC}: a szolgaltatas leallitasa es tiltasa (a binaris/modell-adatok torlese NEM automatikus, lasd a vegen)"
else
  skip "ollama erintetlen (add meg a --purge-ollama kapcsolot, ha azt is szeretned)"
fi
echo ""

if [ "$DRY_RUN" = "1" ]; then
  echo -e "${DIM}--dry-run: fentiek csak terv, semmi nem valtozott.${NC}"
  exit 0
fi

if [ "$YES" != "1" ]; then
  echo -e "${ORANGE}Ez a muvelet nem visszavonhato ott, ahol a fentiekben TOROLVE szerepel.${NC}"
  read -rp "Ird be, hogy TOROL, ha biztosan folytatni akarod: " CONFIRM
  if [ "$CONFIRM" != "TOROL" ]; then
    echo "Megszakitva, semmi nem valtozott."
    exit 1
  fi
fi

echo ""
echo -e "${BOLD}Vegrehajtas...${NC}"

# --- systemd / launchd ---
if [ "$OS" = "Linux" ] && [ "${#SYSTEMD_UNITS_FOUND[@]}" -gt 0 ]; then
  for u in "${SYSTEMD_UNITS_FOUND[@]}"; do
    unit="${u%.service}"; unit="${unit%.timer}"
    systemctl --user stop "$u" 2>/dev/null || true
    systemctl --user disable "$u" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$u"
  done
  systemctl --user daemon-reload 2>/dev/null || true
  ok "systemd --user unitok leallitva es torolve"
elif [ "$OS" = "Darwin" ] && [ "${#LAUNCHD_PLISTS_FOUND[@]}" -gt 0 ]; then
  for p in "${LAUNCHD_PLISTS_FOUND[@]}"; do
    launchctl unload "$HOME/Library/LaunchAgents/$p" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$p"
  done
  ok "launchd agentek leallitva es torolve"
fi

# --- tmux ---
for s in "${TMUX_SESSIONS_FOUND[@]}"; do
  tmux kill-session -t "$s" 2>/dev/null || true
done
[ "${#TMUX_SESSIONS_FOUND[@]}" -gt 0 ] && ok "tmux session-ok leallitva"

# --- worker configok ---
for d in "${WORKER_DIRS_FOUND[@]}"; do
  rm -rf "$d"
done
[ "${#WORKER_DIRS_FOUND[@]}" -gt 0 ] && ok "ugynok-worker konfig-mappak torolve"

# --- seedelt skillek / utemezett feladatok / bumblebee / channel-state ---
for d in "${SKILL_DIRS_FOUND[@]}"; do rm -rf "$d"; done
[ "${#SKILL_DIRS_FOUND[@]}" -gt 0 ] && ok "seedelt skillek torolve"

for d in "${SCHED_DIRS_FOUND[@]}"; do rm -rf "$d"; done
[ "${#SCHED_DIRS_FOUND[@]}" -gt 0 ] && ok "seedelt utemezett feladatok torolve"

if [ "$BB_FOUND" = "1" ]; then
  rm -rf "$BB_DIR"
  ok "bumblebee threat-intel katalogus torolve"
fi

if [ "$CHANNEL_FOUND" = "1" ]; then
  rm -rf "$CHANNEL_DIR"
  ok "channel-state mappa torolve"
fi

# --- settings.json: csak a sajat kulcsunk torlese, minden mas erintetlen ---
if [ "$SETTINGS_HAS_FLAG" = "1" ]; then
  python3 - "$SETTINGS_FILE" <<'PYEOF'
import json, sys, os
p = sys.argv[1]
try:
    data = json.loads(open(p).read())
except Exception:
    data = None
if isinstance(data, dict) and "skipDangerousModePermissionPrompt" in data:
    del data["skipDangerousModePermissionPrompt"]
    open(p, "w").write(json.dumps(data, indent=2))
PYEOF
  ok "~/.claude/settings.json: Wraith-kulcs eltavolitva, a tobbi beallitas maradt"
fi

# --- ollama (opcionalis) ---
if [ "$PURGE_OLLAMA" = "1" ]; then
  if [ "$OS" = "Linux" ]; then
    sudo systemctl disable --now ollama 2>/dev/null || true
    ok "ollama.service leallitva es tiltva"
  elif [ "$OS" = "Darwin" ]; then
    launchctl unload "$HOME/Library/LaunchAgents/com.ollama.plist" 2>/dev/null || true
    skip "macOS-en az ollama app/menusor-ikon kezi leallitasa is szukseges lehet"
  fi
  warn "a bináris és a letöltött modellek maradtak -- teljes eltávolításhoz:"
  echo -e "  ${DIM}Linux:  sudo rm \$(command -v ollama); sudo rm -rf /usr/share/ollama ~/.ollama; sudo userdel ollama${NC}"
  echo -e "  ${DIM}macOS:  rm -rf /Applications/Ollama.app ~/.ollama${NC}"
fi

# --- adat + klon-konyvtar ---
if [ "$KEEP_DATA" = "1" ]; then
  skip "store/ es a klon-konyvtar megtartva (--keep-data)"
else
  if [ "$IS_WRAITH_CLONE" = "1" ]; then
    if [ "$YES" != "1" ]; then
      read -rp "Keszul mentes a torles elott ($INSTALL_DIR -> \$HOME/wraith-backup-*.tar.gz)? [I/n] " DOBACKUP
      DOBACKUP="${DOBACKUP:-i}"
    else
      DOBACKUP="i"
    fi
    if [[ "$DOBACKUP" == "i" || "$DOBACKUP" == "I" || "$DOBACKUP" == "y" || "$DOBACKUP" == "Y" ]]; then
      BACKUP_FILE="$HOME/wraith-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
      tar czf "$BACKUP_FILE" -C "$(dirname "$INSTALL_DIR")" "$(basename "$INSTALL_DIR")" 2>/dev/null \
        && ok "mentes keszult: $BACKUP_FILE" \
        || warn "a mentes nem sikerult, folytatas mentes nelkul"
    fi
    PARENT_DIR="$(dirname "$INSTALL_DIR")"
    cd "$PARENT_DIR"
    rm -rf "$INSTALL_DIR"
    ok "klon-konyvtar torolve: $INSTALL_DIR"
  else
    warn "biztonsagi okbol NEM toroltem a klon-konyvtart (nem ismertem fel Wraith-klonkent) -- toroljed kezzel, ha biztos vagy benne: rm -rf \"$INSTALL_DIR\""
  fi
fi

echo ""
echo -e "${GREEN}${BOLD}Kesz.${NC}"
