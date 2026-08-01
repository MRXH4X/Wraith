---
name: loot-vault
description: Engagement közben talált credential, hash, token, API-kulcs vagy más érzékeny "loot" biztonságos tárolására használd ("mentsd el ezt a jelszót", "találtam egy hash-t", "ezt a tokent tedd biztonságba"). SOHA ne írj nyers credentialt kanban-kártyára vagy chat-üzenetbe tartósan -- csak a vaultba, és a kártyára csak egy referenciát.
---
# Loot vault

## Mikor használd
Bármikor, amikor egy engagement során olyan érzékeny anyag kerül elő, amit vissza kell tudni keresni, de nem szabad nyílt szövegként kanban-kártyán vagy chat-előzményben tárolni tartósan: jelszó, hash (NTLM/SHA/stb.), API-kulcs, session-token, SSH kulcs, cookie.

## Alapszabály
A kanban-kártya és a chat csak **utal** a loot-ra (pl. "admin NTLM hash a vault-ban, ref: loot-<engagement>-001"), a tényleges anyag a vaultban van. Ha véletlenül nyílt szövegben ment be egy chat-üzenetbe, jelezd a gazdának, hogy törölje/rotálja az érintett secretet.

## Tárolás
A meglévő SSH-vault (`/api/vault/ssh-servers`) mellett generikus secretekhez a `/api/vault/secrets` végpont (`src/web/routes/vault-loot.ts`), ami ugyanarra az AES-256-GCM-es, fájl/keychain-alapú vault primitívre épül (`setSecret`/`getSecret`), csak `kind`/`context`/`tags` metaadattal:
```bash
curl -s -X POST http://localhost:$WEB_PORT/api/vault/secrets \
  -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "loot-<engagement-slug>-<sorszám>",
    "kind": "credential|hash|token|apikey|cookie|other",
    "value": "<nyers érték>",
    "context": "<honnan jött: host, user, módszer>",
    "tags": ["<engagement-slug>"]
  }'
```
A válasz `{ id, label, kind, tags }` -- az `id` a rövid (8 karakteres) referencia, EZT írd a kanban-kártyára, sose a `value`-t.

## Visszakeresés
```bash
# metaadat-lista (érték nélkül), engagement szerint szűrve
curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  "http://localhost:$WEB_PORT/api/vault/secrets?tag=<engagement-slug>"

# tényleges érték egy konkrét ref-hez (csak akkor hívd, ha ténylegesen kell)
curl -s -H "Authorization: Bearer $(cat store/.dashboard-token)" \
  "http://localhost:$WEB_PORT/api/vault/secrets/<ref-id>"
```

## Report-hez
A `pentest-report-generator` skill a loot-referenciákat (label + kind + context) illeszti be a jelentésbe -- SOHA a nyers értéket, hacsak a gazda kifejezetten nem kéri kiírni (pl. a végleges, ügyfélnek szánt proof-of-compromise szakaszban).
