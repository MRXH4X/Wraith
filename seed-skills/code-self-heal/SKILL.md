---
name: code-self-heal
description: Amikor a saját forráskódodban (nem a felhasználó projektjében, hanem a Wraith fleet forráskódjában) crash-t, typecheck-hibát vagy piros unit tesztet észlelsz -- akár egy watchdog-jelzésből, akár saját munka közben --, ezt a skillt használd. SOSE patchelj közvetlenül main-re: mindig backup -> branch -> teszt -> PR, és a `code_self_heal` autonómia-kategória szintjétől függően vagy csak jelentesz, vagy jóváhagyásra váró PR-t nyitsz. Bizalmas útvonalakat (vault, auth, approvals, C2-bridge, prompt-safety) SOHA nem patchelsz automatikusan.
---
# Code self-heal (önjavító kód-patch)

## Ez NEM ugyanaz, mint a skill-factory
A `skill-factory` (lásd `docs/skill-factory.md`) **recepteket** (SKILL.md) ír önmagáról, munkafolyamat-szinten. Ez a skill **tényleges forráskódot** patchel (`.ts`, `.sh`, `.py` fájlokat a Wraith repóban) -- ez lényegesen nagyobb kockázat, ezért sokkal szigorúbb korlátok vonatkoznak rá, és soha nem lehet 3. szintű (teljesen autonóm) kategória.

## Mikor triggerelődik
- Egy watchdog (`scripts/channel-watchdog.sh`, `scripts/host-restart-watchdog.sh`) crash-t jelez, és a log egy JS/TS stack trace-t vagy uncaught exception-t tartalmaz (nem csak erőforrás-kimerülést vagy hálózati timeoutot -- azokhoz NEM ez a skill kell, azok a meglévő watchdog-restart logikába tartoznak).
- `npm run typecheck` vagy `npm run test` pirosat ad saját munka közben (pl. egy másik skill lépése után).
- A gazda kifejezetten kéri: "javítsd ki ezt a hibát a kódban".

## Kőbe vésett biztonsági szabályok (ELSŐ olvasás után se hagyd ki egyiket sem)

1. **SOHA nem írsz közvetlenül a `main` branch-re.** Mindig új branch (`fix/self-heal-<rövid-leírás>-<dátum>`).
2. **SOHA nem commitolsz/pusholsz backup nélkül.** Az ELSŐ lépés mindig:
   ```bash
   ./scripts/pre-modify-backup.sh "self-heal-<rövid-leírás>"
   ```
3. **Védett útvonalak -- ezeket SOHA nem patcheled automatikusan**, akármilyen kicsinek tűnik a hiba:
   ```
   src/web/vault.ts
   src/web/routes/vault-loot.ts
   src/web/routes/vault-ssh*.ts
   src/web/routes/approvals.ts
   src/web/auth-gate.ts
   src/web/auth-device-keys.ts
   src/web/keychain.ts
   src/prompt-safety.ts
   src/web/routes/wraith.ts   (identity/auth-adjacent)
   scripts/vault-*
   ```
   Ha a hiba/crash valamelyik itt van: NE írj patchet automatikusan. Diagnosztizáld, írd le SZÖVEGBEN a gyanús sort + a javaslatot, és küldd el a gazdának jóváhagyás-kéréssel (`risky-command-approval-gate` mintájára, `category: "code_self_heal"`), hogy Ő döntsön/alkalmazza manuálisan. Ez a szabály FÜGGETLEN az autonómia-szinttől -- még 2. szinten (jóváhagyás-köteles) sem készítesz itt automata branch-et/patchet, mert már a diagnózis-fázis is érzékeny kódra mutat.
4. **A `code_self_heal` kategória `maxLevel: 2`** (`seed-config/autonomy-config.json`) -- ez azt jelenti, hogy a 3. szint (teljesen autonóm) STRUKTURÁLISAN nem elérhető, a szerver elutasítja a próbálkozást (`403`, lásd `src/web/routes/autonomy.ts`). Ne próbálj ez ellen bármilyen módon "trükközni" (pl. más kategória alatt futtatni a self-heal logikát) -- ha egy fix ezen a kategórián kívül esik, az azt jelenti, hogy nem ide tartozik.
5. **Nem-védett útvonalon is: mindig teszt + typecheck a PR nyitása ELŐTT**, mert nincs kötelező CI-gate más gate-en (bár a repóban most már van `.github/workflows/ci.yml`, ami PR-en lefut, ne hagyatkozz kizárólag rá -- a saját lokális futtatásod a gyorsabb visszacsatolás):
   ```bash
   npm run typecheck && npm run test
   ```
   Ha akár EGY is piros, NE nyiss PR-t -- vagy javítsd tovább, vagy jelentsd a gazdának hogy nem sikerült önállóan megoldani.
6. **Cross-review PR nyitás előtt, ha van hozzá kulcs**: `./scripts/pre-pr-review.sh` (ChatGPT/Gemini review a vault-ban tárolt kulccsal, ha van -- ha nincs kulcs, csendben kihagyja, ez OK).

## Szint szerinti viselkedés
- **Level 1 (alapértelmezett)**: CSAK diagnosztizálsz és jelentesz -- "észleltem egy crash-t itt: <fájl:sor>, valószínű ok: <...>, javasolt fix: <...leírás, NEM patch>". Semmilyen fájlt nem módosítasz, branch-et nem hozol létre.
- **Level 2**: a fenti biztonsági szabályok szerint (backup -> branch -> patch -> typecheck+test -> cross-review, ha van kulcs -> PR nyitás), de a PR-t SOHA nem mergeled magad -- a gazda jóváhagyása/manuális merge-e kell. A PR leírásába írd bele: mi volt a hiba, mi a diagnózis, milyen teszteket futtattál és mi lett az eredményük.
- **Level 3**: nem létezik ennél a kategóriánál (lásd 4. szabály) -- ha valaki megpróbálja beállítani, a szerver elutasítja.

## Tanult mintázatból eredő kód-hiányosság (a self-learning híd)
Ha a `skill-factory`/`auto-skill-from-writeup` reflexiója során kiderül, hogy egy tanulság NEM csak egy skill-leírással orvosolható, hanem tényleges kód hiányzik (pl. egy API-végpont, egy hiányzó CLI-flag), UGYANEZT a pipeline-t (backup -> branch -> teszt -> PR, védett-útvonal-szabállyal) használd, `category: "code_self_heal"` alatt -- ne hozz létre emiatt külön mechanizmust. A diagnózis itt "hiányzó képesség", nem "crash", de a biztonsági korlátok azonosak.

## Miért nem lehet ez teljesen autonóm
Ez egy pentest/biztonsági eszköz saját forráskódja -- egy hibásan "önjavított" auth- vagy vault-kód sokkal nagyobb kárt tehet, mint amennyit egy gyors fix nyerne. A `maxLevel: 2` + védett-útvonal-lista + kötelező backup + kötelező teszt + emberi merge együtt garantálja, hogy az önjavítás segítség marad, nem önálló döntéshozó a saját biztonsági rétegén.
