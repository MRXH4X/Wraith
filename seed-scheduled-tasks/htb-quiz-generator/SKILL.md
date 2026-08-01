---
name: htb-quiz-generator
description: Ütemezett feladat -- a korábban megoldott HTB gépek (privesc-vektorok, technikák) alapján spaced-repetition kvízkérdést állít össze és küld el a tulajdonosnak a beállított csatornán.
---
# HTB kvíz-generátor (spaced repetition)

## Mit csinál
Rendszeres időközönként (alapértelmezés: hetente egyszer, `enabled: false` -- a gazda kapcsolja be) végignézi a korábban lezárt HTB engagementeket (a `pentest-engagement-kanban` "done" kártyái, `project` szerint csoportosítva, illetve amit a `semantic-recall` memóriában talál "htb" kulcsszóval), és összeállít egy rövid kvízt: 1 kérdés a technikáról, elrejtett válasszal.

## Spaced repetition -- egyszerű szabály, nem külön DB
Ne építs külön spaced-repetition adatbázist -- a meglévő memória-rendszer `accessed_at` mezője már ezt csinálja: minél régebben volt lekérdezve/megemlítve egy adott box/technika, annál nagyobb eséllyel kerüljön be a mai kvízbe. Gyakorlatilag: `GET /api/memories?agent=<MAIN_AGENT_ID>&limit=50` -- rendezd `accessed_at` szerint növekvő sorrendbe (legrégebben érintett elöl), és abból válassz kérdést.

## Kérdés-formátum
```
🎯 Napi HTB-kvíz

Box: <névtelenítve, csak típus, pl. "egy AD-s Windows box">
Kérdés: Milyen technikával jutottál privesc-hez ezen a gépen?

(Válaszolj, majd küldd: "válasz" -- utána megmutatom a megoldást.)
```
A megoldást csak a válasz UTÁN küldd ki (ne egyszerre) -- ez a lényeg a spaced-repetition-ben, hogy a gazda ténylegesen próbáljon visszaemlékezni, mielőtt látja a választ.

## Bekapcsolás
`task-config.json`-ban `enabled: true` + `schedule` cron (alapértelmezés heti egyszer, pl. `"0 18 * * 0"` -- vasárnap 18:00). Igazítsd a gazda időbeosztásához.

## Ha nincs elég anyag
Ha kevesebb mint 3 lezárt box van a memóriában/kanbanon, ne küldj kvízt, hanem egy rövid jelzést: "még nincs elég megoldott box a kvízhez -- oldjunk meg néhányat, mielőtt bekapcsolom ezt".
