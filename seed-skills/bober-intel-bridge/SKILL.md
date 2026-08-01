---
name: bober-intel-bridge
description: Amikor a Bober toolsuite (scanner/enumerációs szkriptek) kimenetét kell feldolgozni és kereshetővé tenni ("dolgozd fel a bober kimenetet", "importáld a scan eredményt"), ezt a skillt használd. A nyers scanner-kimenetet strukturált tényként rögzíti az intel-registry-ben (scripts/intel_db.py), FTS5+vector kereshetővé téve későbbi engagementekhez.
---
# Bober -> intel-registry bridge

## Mikor használd
A Bober suite (személyes scanner/enumerációs eszközkészlet) egy futása után, amikor az eredményt nem csak egyszeri kártyaként, hanem **kereshető, hosszú távú tudásbázisként** akarod megtartani (pl. "melyik korábbi engagementen láttam már ilyen szolgáltatás-verziót/konfigurációt").

## Eljárás
1. Olvasd be a Bober kimenetét (nyers scan-log vagy strukturált JSON, attól függően mit ad az adott scanner-modul).
2. Minden érdemi találatból (nyitott port + szolgáltatás + verzió, konfigurációs hiba, gyanús végpont) egy `add-fact` hívás -- a `--source` mezőbe írd a Bober modul nevét és az engagement/host azonosítót, hogy visszakereshető legyen tag helyett (a CLI-nek nincs külön `--tags` mezője):
```bash
python3 scripts/intel_db.py add-fact \
  --title "<host>:<port> <szolgáltatás> <verzió> -- <mi a lényeg>" \
  --domain pentest \
  --source "bober:<modul-név>:<engagement-slug>:<host>" \
  --tier 1 \
  --content "<parancs + kimenet lényege>"
```
3. Ha a találat mintázat (nem egyszeri, hanem visszatérő -- pl. ugyanaz a rossz konfiguráció több hoszton), `add-watch`-csal jelezd, hogy a jövőbeli Bober-futások figyeljenek rá:
```bash
python3 scripts/intel_db.py add-watch --title "<mintázat neve>" --domain pentest --direction "ismétlődő találat több hoszton"
```
4. Engagement-zárás után `dump --days <N>` a teljes intel-lenyomat áttekintéséhez a report-generátorhoz.

## Miért nem elég a nyers log
A Bober scan-logok elszigetelt fájlok -- 2 hónap múlva senki nem fogja `grep`-elni őket. Az `intel_db.py dump` strukturáltan, dátumozva adja vissza a tényeket a napi brief/report-generátor számára. Ha egy konkrét találatot a hosszú távú, szemantikusan kereshető emlékezetbe is fel akarsz venni (nem csak a rövid táv aktív-fókusz JSON-be), azt a `semantic-recall` skill memória-mentés lépése végzi (`POST /api/memories`), nem az intel-registry.
