---
name: htb-ctf-runner
description: HTB/CTF gép megoldásakor használd ("kezdjük el ezt a gépet", "nézzük meg ezt a HTB boxot", "recon indul"). Összeköti a 0xdf-htb-mega-skill-v30 metodikáját a pentest-engagement-kanban nyomkövetéssel, és a végén meghívja az auto-skill-from-writeup-ot.
---
# HTB/CTF runner

## Mikor használd
Amikor a gazda egy konkrét HTB/CTF gépen dolgozik veled ("kezdjük el <box>-ot", "recon <ip>").

## Eljárás
1. **Engagement felvétele**: `pentest-engagement-kanban` szerint a `project` mező legyen a box neve, hozz létre egy kezdő kártyát "recon" címkével, `status: planned` ("Recon indul -- <box>, <ip>").
2. **Metodika**: kövesd a `0xdf-htb-mega-skill-v30` recon flow-t (nmap teljes port scan -> szolgáltatás-specifikus enumeráció -> web tech azonosítás -> forráskód review, ha van). Minden releváns találatot (nyitott port + szolgáltatás + verzió, gyanús endpoint, lehetséges CVE) azonnal kártyaként rögzíts, "recon" címkével, ugyanazzal a `project` értékkel.
3. **Foothold**: amint van konkrét exploit-terv, a kártyát mozgasd `in_progress`-be (`POST /api/kanban/<id>/move`) és/vagy hozz létre egy "foothold" címkés kártyát rá hivatkozva. A próbálkozásokat (mi működött, mi nem) a kártya leírásába gyűjtsd -- ez lesz a gotcha-alap a 6. lépéshez.
4. **Privesc**: user shell után "privesc" címkés kártyák, kövesd a mega-skill Linux/Windows privesc decision tree-jét. Talált credentialt/hash-t azonnal `loot-vault`-ba (tag = box neve), NE a kártya szövegébe.
5. **Root/lezárás**: amint root/system megvan, egy összefoglaló kártya `status: done`, a teljes lánc rövid leírásával (recon -> foothold -> privesc, technikák neve).
6. **Lezárás után**: hívd meg az `auto-skill-from-writeup` skillt -- ez a lezárt `project` kártyáiból generál egy újrahasznosítható gotcha-bejegyzést a mega-skillbe, hogy legközelebb ne kelljen újra kitalálni.

## Miért kanban és nem csak jegyzet
A kanban-kártyák időbélyegzettek és túlélik a session-restartot -- ha a gazda 3 nap múlva visszatér a boxhoz, a `project` szerinti kártyalista maga a válasz arra, hogy hol tartottak, nem kell újra elmondani.
