// Generic "loot" vault for pentest engagements: credentials, hashes, tokens,
// API keys, cookies -- anything found during an engagement that must be
// retrievable but never sit in plaintext on a kanban card or in chat history.
//
// Deliberately reuses the existing encrypted secret primitives in vault.ts
// (setSecret/getSecret/listSecrets/deleteSecret) rather than a parallel
// storage mechanism -- one AES-256-GCM-at-rest store for the whole app.
// Metadata (kind/context/tags) rides inside the encrypted value as JSON
// since the underlying VaultEntry only has {id, label, encrypted}; listing
// therefore decrypts each entry to surface metadata, but the `list` route
// never returns the raw secret -- only `reveal` does, and reveal is the one
// call sites should treat as sensitive (audit-log it if/when a naplo-audit
// hook is wired up here).

import { randomUUID } from 'node:crypto'
import { readBody, json } from '../http-helpers.js'
import { setSecret, getSecret, listSecrets, deleteSecret } from '../vault.js'
import type { RouteContext } from './types.js'

interface LootPayload {
  value: string
  kind: string
  context: string
  tags: string[]
}

const VALID_KINDS = new Set(['credential', 'hash', 'token', 'apikey', 'cookie', 'other'])
const LOOT_PREFIX = 'loot:'

export function isLootId(id: string): boolean {
  return id.startsWith(LOOT_PREFIX)
}

export function parsePayload(raw: string): LootPayload | null {
  try {
    const p = JSON.parse(raw)
    if (typeof p?.value !== 'string') return null
    return {
      value: p.value,
      kind: VALID_KINDS.has(p.kind) ? p.kind : 'other',
      context: typeof p.context === 'string' ? p.context : '',
      tags: Array.isArray(p.tags) ? p.tags.filter((t: unknown) => typeof t === 'string') : [],
    }
  } catch {
    return null
  }
}

export async function tryHandleVaultLoot(ctx: RouteContext): Promise<boolean> {
  const { req, res, path, method, url } = ctx
  if (!path.startsWith('/api/vault/secrets')) return false

  // GET /api/vault/secrets?tag=<engagement-slug> -- metadata only, no values
  if (path === '/api/vault/secrets' && method === 'GET') {
    const tagFilter = url.searchParams.get('tag')
    const entries = listSecrets().filter(e => isLootId(e.id))
    const out = []
    for (const e of entries) {
      const raw = getSecret(e.id)
      const payload = raw ? parsePayload(raw) : null
      if (!payload) continue
      if (tagFilter && !payload.tags.includes(tagFilter)) continue
      out.push({
        id: e.id.slice(LOOT_PREFIX.length),
        label: e.label,
        kind: payload.kind,
        context: payload.context,
        tags: payload.tags,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })
    }
    json(res, { secrets: out })
    return true
  }

  // POST /api/vault/secrets -- create a new loot entry
  if (path === '/api/vault/secrets' && method === 'POST') {
    const body = await readBody(req)
    let data: any
    try {
      data = JSON.parse(body.toString())
    } catch {
      json(res, { error: 'invalid JSON body' }, 400)
      return true
    }

    const label = typeof data.label === 'string' ? data.label.trim() : ''
    const value = typeof data.value === 'string' ? data.value : ''
    if (!label || !value) {
      json(res, { error: 'label and value are required' }, 400)
      return true
    }

    const slug = randomUUID().slice(0, 8)
    const id = `${LOOT_PREFIX}${slug}`
    const payload: LootPayload = {
      value,
      kind: VALID_KINDS.has(data.kind) ? data.kind : 'other',
      context: typeof data.context === 'string' ? data.context : '',
      tags: Array.isArray(data.tags) ? data.tags.filter((t: unknown) => typeof t === 'string') : [],
    }
    setSecret(id, label, JSON.stringify(payload))
    json(res, { id: slug, label, kind: payload.kind, tags: payload.tags }, 201)
    return true
  }

  const revealMatch = path.match(/^\/api\/vault\/secrets\/([^/]+)$/)
  if (revealMatch && method === 'GET') {
    const id = `${LOOT_PREFIX}${revealMatch[1]}`
    const raw = getSecret(id)
    const payload = raw ? parsePayload(raw) : null
    if (!payload) {
      json(res, { error: 'not found' }, 404)
      return true
    }
    json(res, payload)
    return true
  }

  if (revealMatch && method === 'DELETE') {
    const id = `${LOOT_PREFIX}${revealMatch[1]}`
    const ok = deleteSecret(id)
    json(res, { ok })
    return true
  }

  return false
}
