---
name: c2-operator-bridge
description: Amikor Adaptix C2 vagy Wraith C2 listenerét/agentjeit kell vezérelni chat-parancsból ("indíts egy listenert", "milyen agentek vannak fent", "adj taskot ennek az agentnek"). Ez a skill csak a chat<->C2 API hidat írja le -- a tényleges C2-metodikát (payload build, tasking-parancsok) a saját Adaptix/Wraith C2 dokumentációd adja.
---
# C2 operator bridge

## Mikor használd
Ha a gazda a fleet-en (Telegram/Slack) keresztül akarja irányítani a saját Adaptix C2 vagy Wraith C2 teamserverét, anélkül hogy külön a C2 UI-hoz kellene ülnie.

## Előfeltétel
Ez a skill NEM tartalmazza a C2 teamserver saját REST/gRPC API-jának pontos végpontjait -- azok a te Adaptix/Wraith C2 repódban vannak dokumentálva (`docs/api.md` vagy hasonló azon a projekten). Az agent az ottani dokumentációt olvassa be first (`view`/`grep` a C2 repóban), MIELŐTT bármilyen tasking-parancsot kiadna.

## Minta-eljárás (általánosítva, a saját C2 API-dra igazítandó)
1. **Auth**: a C2 teamserver hitelesítő adatait a `loot-vault`-ban tárold (`kind: "token"`, `context: "adaptix-teamserver"` vagy `"wraith-c2-teamserver"`), NEM sima `.env`-ben, ha a C2 credential érzékenyebb, mint egy sima API-kulcs.
2. **Listener indítás**: chat-parancsból ("indíts egy HTTPS listenert 443-on") -> az agent összeállítja a C2 API kérést a te dokumentációd szerint, és VISSZAKÉRDEZ jóváhagyásra a `risky-command-approval-gate` skillen keresztül, mielőtt ténylegesen elindítja (egy élő listener external exposure-t jelent).
3. **Agent lista / státusz**: read-only lekérdezés (aktív implantok, last-checkin) -- ez NEM igényel approvalt, csak státuszjelentés.
4. **Tasking**: egy adott C2-agentnek parancs küldése (shell, lateral move, stb.) -- MINDIG a `risky-command-approval-gate`-en át, mert ez potenciálisan destruktív/zajos hálózaton.
5. **Eredmény visszacsatolás**: a C2-agent taskingjének eredményét a megfelelő pentest-engagement kanban-kártyára írd (a `project` = az engagement, a kártya leírásába a task+eredmény).

## Miért nem egy kész, kőbe vésett API-lista
Az Adaptix C2 és a Wraith C2 saját fejlesztésű projektjeid, API-juk változhat verziónként -- ha ez a skill hardcode-olt végpontokat tartalmazna, minden C2-oldali refaktor után elavulna. Ehelyett a skill maga a **fegyelmezett eljárás** (approval-gate, loot-vault, kanban-visszacsatolás), a konkrét HTTP-hívást az agent minden alkalommal a C2 repó aktuális dokumentációjából olvassa ki.
