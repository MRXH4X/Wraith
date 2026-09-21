---
name: auto-skill-from-writeup
description: HTB/CTF gép lezárása után (root/system megvan, a htb-ctf-runner "done" kártyát írt) automatikusan hívd meg. A lezárt engagement kanban-kártyáiból egy újrahasznosítható "Buktatók"-bejegyzést ír a 0xdf-htb-mega-skill-v30-ba (vagy ha az nem elérhető, egy önálló skillbe), a beépített skill-factory patch-konvenciót követve.
---
# Auto-skill a megoldott HTB gépekből

## Mikor használd
Közvetlenül a `htb-ctf-runner` lezárása után, VAGY ha a gazda kifejezetten kéri ("csinálj ebből egy skillt", "jegyezzük fel a tanulságot").

## Ez NEM egy külön mechanizmus -- a meglévő skill-factory-t hívja explicit módon
A fleet amúgy is figyeli 5+ tool-hívásos komplex feladatok után, hogy van-e újrahasznosítható minta (lásd `docs/skill-factory.md`). Egy HTB box megoldása szinte mindig ilyen -- ez a skill csak **explicit trigger + HTB-specifikus séma** ahhoz, hogy a lezárás után biztosan megtörténjen, ne csak "esetleg" a következő reflexió-ciklusban.

## Eljárás
1. Gyűjtsd össze a lezárt `project` (box neve) kanban-kártyáit (`GET /api/kanban`, szűrve).
2. Ha a technika (privesc-vektor, CVE, konfigurációs hiba) MÁR szerepel a `0xdf-htb-mega-skill-v30` gotcha-adatbázisában -- NE írd újra, csak egy rövid utalást tegyél hozzá ("láttuk <box>-on is").
3. Ha ÚJ mintázat: patch (célzott csere, nem teljes újraírás) a mega-skill megfelelő szekciójába, vagy ha az adott témára még nincs szekció, egy új bekezdés a "Buktatók"/gotcha részbe:
   - **Mi volt a helyzet** (szolgáltatás/technológia/konfiguráció)
   - **Mi nem működött elsőre** (ha volt tévút)
   - **Mi a működő recept** (konkrét parancs/lépéssor)
   - **Miért fontos** (mikor fog még előjönni)
4. Ha a mega-skill fájl közeledik az 500 soros irányelvhez, tedd a részletet egy `references/`-fájlba, és a SKILL.md-ben csak egy rövid utaló sort hagyj.
5. Jelezd a gazdának röviden: mi lett rögzítve, hova (fájl/szekció), és hogy ez legközelebb rutinná teszi ugyanazt a helyzetet.

## Miért fontos a "ne írd újra, csak jelezd" szabály
Egy 540+ writeup-ra épülő mega-skill könnyen szétdagad, ha minden hasonló SMB-null-session vagy sudo-misconfig újra teljes bekezdést kap. A cél a MINTÁZAT egyszeri, jó leírása + a további előfordulások rövid kereszthivatkozása, nem a duplikáció.
