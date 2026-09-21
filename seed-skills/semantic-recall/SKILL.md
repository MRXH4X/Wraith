---
name: semantic-recall
description: Amikor egy jelenlegi találathoz hasonló korábbi technikát/jegyzetet keresel ("láttunk már ilyet?", "volt már hasonló privesc?", "keress rá a memóriában"), ezt a skillt használd. A fleet beépített FTS5+vektor hibrid keresését (`GET /api/memories?mode=hybrid`) hívja meg, nem az intel-registryt és nem a kanbant.
---
# Szemantikus recall (privesc/technika keresés)

## Mikor használd
Amikor egy aktuális pentest-helyzetre ("gyanús SUID bináris", "furcsa SMB-konfiguráció", "ez a webshell-technika ismerős") rá akarsz kérdezni: volt-e már hasonló a korábbi munkád/emlékeid között -- NEM csak kulcsszó-egyezés, hanem jelentésbeli hasonlóság alapján.

## Előfeltétel: a találat legyen benne a memóriában
A hibrid keresés csak azt találja meg, amit korábban ténylegesen elmentettél emlékként (`POST /api/memories`). Ha egy technikát csak kanban-kártyán vagy intel-registryben rögzítettél, oda NEM lát bele -- érdemes engagement-lezáráskor (`auto-skill-from-writeup` mellett) a lényegi tanulságot memóriaként is elmenteni:
```bash
curl -s -X POST http://localhost:$WEB_PORT/api/memories \
  -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "<a technika/mintázat leírása, kontextussal>",
    "category": "warm",
    "keywords": "<pentest,privesc,htb,...>"
  }'
```

## Keresés
```bash
curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  "http://localhost:$WEB_PORT/api/memories?q=<szabad szöveges leírás>&mode=hybrid&limit=10"
```
A `mode=hybrid` FTS5 (kulcsszó) + vektor (Ollama `nomic-embed-text` embedding) találatokat fuz össze Reciprocal Rank Fusion-nel -- tehát akkor is talál, ha a megfogalmazás más, de a jelentés hasonló (pl. "world-writable cron script" vs. "cron job amit bárki írhat").

## Eredmény felhasználása
- Ha releváns találat jön vissza: idézd a lényeget, és jelezd melyik korábbi engagementről/box-ról van szó, mielőtt újra kitalálnád a megoldást.
- Ha nincs találat: ez maga is információ -- új mintázat, `auto-skill-from-writeup` triggerelendő a végén.

## Miért nem az intel-registry
Az `intel_db.py` (lásd `bober-intel-bridge`) strukturált, rövid-távú tényregiszter (napi brief-hez), nincs benne szemantikus/vektoros keresés. A hosszú távú, "hasonló-e ez valamihez, amit már láttam" jellegű kérdésre a fleet saját memória-rendszere (FTS5+vektor) a helyes eszköz.
