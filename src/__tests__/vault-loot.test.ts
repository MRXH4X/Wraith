// Unit tests for the loot-vault JSON payload contract used by
// src/web/routes/vault-loot.ts. Deliberately does NOT exercise the real
// file-backed/keychain-backed vault.ts store (setSecret/getSecret touch
// PROJECT_ROOT + OS keychain, which no other test in this repo isolates
// either) -- this covers the part most likely to regress silently: the
// kind/tags/context validation a malformed or hostile POST body could abuse.

import { describe, it, expect } from 'vitest'
import { isLootId, parsePayload } from '../web/routes/vault-loot.js'

describe('isLootId', () => {
  it('recognizes the loot: prefix', () => {
    expect(isLootId('loot:abc123')).toBe(true)
  })

  it('rejects ids without the prefix (e.g. an SSH vault secret id)', () => {
    expect(isLootId('ssh-key-abc')).toBe(false)
    expect(isLootId('')).toBe(false)
  })
})

describe('parsePayload', () => {
  it('parses a well-formed loot payload', () => {
    const raw = JSON.stringify({
      value: 'Administrator:aad3b435b51404eeaad3b435b51404ee:...',
      kind: 'hash',
      context: 'dumped via secretsdump.py against DC01',
      tags: ['htb-forest', 'ntlm'],
    })
    expect(parsePayload(raw)).toEqual({
      value: 'Administrator:aad3b435b51404eeaad3b435b51404ee:...',
      kind: 'hash',
      context: 'dumped via secretsdump.py against DC01',
      tags: ['htb-forest', 'ntlm'],
    })
  })

  it('falls back to kind "other" for an unknown/missing kind', () => {
    const raw = JSON.stringify({ value: 'x', kind: 'not-a-real-kind' })
    expect(parsePayload(raw)?.kind).toBe('other')

    const rawNoKind = JSON.stringify({ value: 'x' })
    expect(parsePayload(rawNoKind)?.kind).toBe('other')
  })

  it('defaults context to empty string and tags to [] when absent or malformed', () => {
    const raw = JSON.stringify({ value: 'x', tags: 'not-an-array' })
    const parsed = parsePayload(raw)
    expect(parsed?.context).toBe('')
    expect(parsed?.tags).toEqual([])
  })

  it('drops non-string entries from a mixed tags array instead of throwing', () => {
    const raw = JSON.stringify({ value: 'x', tags: ['ok', 42, null, 'also-ok'] })
    expect(parsePayload(raw)?.tags).toEqual(['ok', 'also-ok'])
  })

  it('returns null for a payload missing the required value field', () => {
    expect(parsePayload(JSON.stringify({ kind: 'token' }))).toBeNull()
  })

  it('returns null for invalid JSON rather than throwing', () => {
    expect(parsePayload('{not json')).toBeNull()
  })
})
