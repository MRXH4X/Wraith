# Code self-heal (önjavító kód-patch)

---

## 🎯 Mit tud / miért érdekes

A `skill-factory` a munkafolyamatokból tanul (recepteket ír magának). A code-self-heal egy szinttel mélyebbre megy: ha a fleet SAJÁT forráskódjában (nem a te projektedben, hanem a Wraith repóban) crash, typecheck-hiba vagy piros teszt üti fel a fejét, az ügynök diagnosztizálja, és -- a beállított bizalmi-szinttől függően -- vagy csak jelzi, vagy elő is készíti a javítást egy PR-ben, amit neked kell jóváhagynod/mergelned.

**Ez tudatosan NEM lehet teljesen autonóm.** Egy pentest-eszköz saját auth/vault-kódjának hibás önjavítása súlyosabb kockázat, mint amennyit egy gyors fix megér -- ezért a `code_self_heal` autonómia-kategória szerkezetileg le van tiltva 3. (teljesen önálló) szintre, és van egy kőbe vésett "védett útvonal" lista (vault, auth, approvals, C2-bridge, prompt-safety), amit a rendszer SOHA nem patchel automatikusan, csak jelentés + emberi döntés szintjén kezel.

## 🛠 Hogyan működik

### Trigger
- Watchdog (`scripts/channel-watchdog.sh`, `scripts/host-restart-watchdog.sh`) crash-jelzése JS/TS stack trace-szel
- `npm run typecheck` / `npm run test` piros eredménye saját munka közben
- Explicit gazda-kérés ("javítsd ki ezt a hibát")

### Biztonsági korlátok (mindegyik kódba/configba égetett, nem csak dokumentált)
| Korlát | Hol van kikényszerítve |
|---|---|
| `code_self_heal` sosem lehet 3. szint | `seed-config/autonomy-config.json`: `maxLevel: 2`, szerver-oldalon (`src/web/routes/autonomy.ts`) elutasítja a próbálkozást |
| Backup minden módosítás előtt | `scripts/pre-modify-backup.sh` -- SQLite konzisztens snapshot + kritikus configok |
| Sosem direkt `main`-re | mindig branch + PR, sosem auto-merge |
| Védett útvonalak (vault/auth/approvals/C2-bridge/prompt-safety) | a `code-self-heal` skill explicit listája -- ezekre csak diagnózis + emberi jóváhagyás-kérés, automata patch soha |
| Teszt-gate PR előtt | `npm run typecheck && npm run test` lokálisan, plusz `.github/workflows/ci.yml` a PR-en (typecheck + vitest + syntax-check) |
| Opcionális cross-review | `scripts/pre-pr-review.sh` -- ChatGPT/Gemini review, ha van API-kulcs a vault-ban |

### Szint szerinti viselkedés
- **1. szint (alapértelmezett):** csak diagnózis + jelentés, semmilyen fájl nem változik.
- **2. szint:** backup → branch → patch → typecheck+test → (ha van kulcs) cross-review → PR nyitás. A merge mindig kézi.
- **3. szint:** nem létezik ennél a kategóriánál.

### A self-learning híd
Ha a `skill-factory`/`auto-skill-from-writeup` reflexiója egy tényleges kód-hiányosságot (nem csak workflow-mintát) tár fel, ugyanez a pipeline viszi tovább `code_self_heal` kategória alatt -- egy mechanizmus, két belépési pont (crash-diagnózis vagy hiányzó-képesség-diagnózis).

*Kapcsolódó: [Heartbeat + fokozatos autonómia](heartbeat-autonomy.md), [Skill-factory](skill-factory.md)*
