---
name: risky-command-approval-gate
description: MIELŐTT egy potenciálisan destruktív vagy visszafordíthatatlan pentest-műveletet (élő exploit futtatás célgépen, C2 listener indítás, célgép-fájl módosítás/törlés, credential-alapú lateral move) elindítanál, ezt a skillt használd. A `pentest_risky_command` autonómia-kategórián keresztül kötelező tulajdonosi jóváhagyást kér, mielőtt bármi ténylegesen lefut.
---
# Risky pentest command approval gate

## Mikor használd
Bármikor, amikor egy pentest-akció köre túlmutat a passzív reconon/enumeráción:
- élő exploit futtatása egy célgépen (nem csak PoC-teszt saját sandboxban)
- C2 listener indítása vagy külső elérésű endpoint nyitása
- célgépen fájl írása/törlése, konfiguráció módosítása
- talált credentiallel lateral movement (más gépre bejelentkezés)
- bármi, amit visszavonni nehéz vagy lehetetlen, vagy ami az ügyfél éles rendszerét érintheti

Read-only recon/enumeráció (nmap, gobuster, banner-grab, stb.) NEM megy ezen a gate-en át -- az simán logolható a `pentest-engagement-kanban`-ra.

## Miért locked kategória
A `seed-config/autonomy-config.json`-ban a `pentest_risky_command` `locked: true, maxLevel: 1` -- tehát ez SOHA nem emelhető magasabb autonómia-szintre (ellentétben pl. a `kanban_archive_done`-nal, ami idővel automatikussá válhat). Ez szándékos: egy célgépen futó destruktív parancs nem "megszokható" kockázat.

## Eljárás
1. Állítsd össze a kérést humán nyelven -- pontosan mit csinálna a parancs, milyen célgépen/hoszton, mi a visszafordíthatósága.
2. Küldd be jóváhagyásra:
```bash
curl -s -X POST http://localhost:$WEB_PORT/api/approvals \
  -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "<a te agent-id-d>",
    "category": "pentest_risky_command",
    "action_description": "<pontos leírás: mit, hol, milyen hatással>",
    "action_payload": "<opcionális: a tényleges parancs/payload JSON-stringként>"
  }'
```
3. A `main-agent` (aki a tulajdonoshoz ér el) az `approval-request-handling` skill szerint kiküldi a kérést Telegramon/Slacken, és VÁRJA a tulajdonos IGEN/NEM válaszát -- a kérő agentnek NEM szabad saját magát jóváhagynia, és a válasz csak a párosított tulajdonos senderId-jétől fogadható el.
4. Amíg nincs explicit "IGEN <id>" a tulajdonostól, a parancs NEM fut le. Timeout esetén a kérés automatikusan elévül -- ismételd meg, ha még mindig releváns.
5. Jóváhagyás után a tényleges végrehajtást és eredményét írd vissza a megfelelő `pentest-engagement-kanban` kártyára.

## Kapcsolódó skill
`approval-request-handling` -- ez a fő-agens oldali eljárás, ami a tulajdonoshoz kiküldi és lezárja a kérést. Ez a skill a KÉRŐ (sub-agent/pentest-munkafolyamat) oldalt írja le.
