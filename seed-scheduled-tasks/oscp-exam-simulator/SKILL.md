---
name: oscp-exam-simulator
description: Ütemezett feladat -- rendszeres időközönként FELAJÁNL egy időkorlátos, OSCP-stílusú gyakorló kihívást (nem indítja el automatikusan), majd a gazda jóváhagyása után a `pentest-engagement-kanban` + `pentest-report-generator` skillekkel keretezi és értékeli.
---
# OSCP-stílusú exam-szimulátor

## Miért csak felajánlás, nem auto-indítás
Egy több órás (OSCP-nél tipikusan 23:45) időkorlátos kihívás elindítása erőforrás- és időigényes elköteleződés a gazda részéről -- ezt NEM szabad automatikusan, megkérdezés nélkül elindítani, csak felkínálni. Ha a gazda igent mond, onnantól tényleges engagementként kezeld.

## Mit csinál (ha a gazda elfogadja)
1. Egy `project` = `oscp-sim-<dátum>` engagement felvétele (`pentest-engagement-kanban` szerint).
2. Időkorlát rögzítése (pl. kártya `due_date` mező, vagy egyszerű üzenet: "a kihívás <időpont>-ig tart").
3. A gazda a szokásos módon dolgozik (recon/foothold/privesc kártyák, `loot-vault`, stb.) -- a szimulátor NEM ad extra segítséget a technikai részben, csak keretezi az időt és a jegyzetelést, különben nem ér semmit gyakorlásként.
4. Időkorlát lejártakor (vagy ha a gazda jelzi, hogy kész): `pentest-report-generator` meghívása -- a jelentés minősége maga az önértékelés (hiányzik-e bizonyíték, elég részletes-e az attack chain).
5. Utólagos értékelés: hasonlítsd össze a jelentést egy OSCP-elvárás-listával (executive summary megvan-e, minden findinghoz van-e bizonyíték+hatás+javaslat, attack chain végigkövethető-e) -- ezt mondd el visszajelzésként, NE csak "jó lett".

## Ajánlás-üzenet formátum
```
🎯 Gyakorlás? Egy időkorlátos, OSCP-stílusú kihívás most ránézésre ráférne -- 
utoljára <X napja/hete> csináltunk ilyet. Indítsunk egyet? (igen/most nem)
```
Ha "most nem" -- ne kérdezz rá újra a következő N napban (lásd `schedule`), ne légy tolakodó.

## Bekapcsolás
`task-config.json`-ban `enabled: true` + `schedule` (alapértelmezés kéthetente). A gyakoriságot a gazda tempójához igazítsd -- ha minden ajánlást elutasít néhányszor egymás után, ritkítsd.
