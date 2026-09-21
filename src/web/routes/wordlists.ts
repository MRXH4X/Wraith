import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { STORE_DIR } from '../../config.js'
import { listWordlists, getWordlist, createWordlist, updateWordlist, deleteWordlist } from '../../db.js'
import { readBody, json } from '../http-helpers.js'
import type { RouteContext } from './types.js'

const WORDLISTS_DIR = join(STORE_DIR, 'wordlists')

function ensureWordlistsDir(): void {
  mkdirSync(WORDLISTS_DIR, { recursive: true })
}

function countLines(filePath: string): number | null {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return content.split('\n').filter(l => l.trim().length > 0).length
  } catch {
    return null
  }
}

export async function tryHandleWordlists(ctx: RouteContext): Promise<boolean> {
  const { req, res, path, method, url } = ctx
  if (!path.startsWith('/api/wordlists')) return false

  // GET /api/wordlists — list with optional ?category= and ?tag= filters
  if (path === '/api/wordlists' && method === 'GET') {
    const category = url.searchParams.get('category') ?? undefined
    const tag = url.searchParams.get('tag') ?? undefined
    const rows = listWordlists({ category, tag })
    json(res, rows.map(r => ({ ...r, tags: r.tags ? r.tags.split(',').filter(Boolean) : [] })))
    return true
  }

  // POST /api/wordlists — register a new wordlist
  // Body: { name, category?, description?, tags?, path? (existing fs path), text? (inline content) }
  if (path === '/api/wordlists' && method === 'POST') {
    ensureWordlistsDir()
    const body = await readBody(req)
    const data = JSON.parse(body.toString()) as {
      name?: string
      category?: string
      description?: string
      tags?: string[]
      path?: string
      text?: string
      uploaded_by?: string
    }
    if (!data.name?.trim()) { json(res, { error: 'name required' }, 400); return true }
    if (!data.path && !data.text) { json(res, { error: 'path or text required' }, 400); return true }

    let filePath: string
    if (data.text) {
      const id = randomUUID().slice(0, 8)
      filePath = join(WORDLISTS_DIR, `${id}.txt`)
      writeFileSync(filePath, data.text, 'utf-8')
    } else {
      filePath = resolve(data.path!)
      if (!existsSync(filePath)) { json(res, { error: 'File not found at provided path' }, 400); return true }
    }

    const id = randomUUID().slice(0, 8)
    const tags = Array.isArray(data.tags) ? data.tags.filter(t => typeof t === 'string' && t.trim()).join(',') : ''
    createWordlist({
      id,
      name: data.name.trim(),
      path: filePath,
      category: data.category?.trim() || 'custom',
      tags,
      description: data.description?.trim() ?? null,
      size_lines: countLines(filePath),
      uploaded_by: data.uploaded_by?.trim() ?? null,
    })
    json(res, { ok: true, id })
    return true
  }

  const idMatch = path.match(/^\/api\/wordlists\/([^/]+)$/)

  // GET /api/wordlists/:id — single wordlist metadata
  if (idMatch && method === 'GET') {
    const row = getWordlist(decodeURIComponent(idMatch[1]))
    if (!row) { json(res, { error: 'Not found' }, 404); return true }
    json(res, { ...row, tags: row.tags ? row.tags.split(',').filter(Boolean) : [] })
    return true
  }

  // PUT /api/wordlists/:id — update metadata
  if (idMatch && method === 'PUT') {
    const id = decodeURIComponent(idMatch[1])
    if (!getWordlist(id)) { json(res, { error: 'Not found' }, 404); return true }
    const body = await readBody(req)
    const data = JSON.parse(body.toString()) as {
      name?: string
      description?: string
      category?: string
      tags?: string[]
    }
    const patch: Parameters<typeof updateWordlist>[1] = {}
    if (data.name !== undefined) patch.name = data.name.trim()
    if (data.description !== undefined) patch.description = data.description.trim()
    if (data.category !== undefined) patch.category = data.category.trim()
    if (Array.isArray(data.tags)) patch.tags = data.tags.filter(t => typeof t === 'string' && t.trim()).join(',')
    updateWordlist(id, patch)
    json(res, { ok: true })
    return true
  }

  // DELETE /api/wordlists/:id — remove entry (does not delete file)
  if (idMatch && method === 'DELETE') {
    const id = decodeURIComponent(idMatch[1])
    if (deleteWordlist(id)) { json(res, { ok: true }); return true }
    json(res, { error: 'Not found' }, 404)
    return true
  }

  // GET /api/wordlists/:id/path — return filesystem path for direct tool use
  const pathMatch = path.match(/^\/api\/wordlists\/([^/]+)\/path$/)
  if (pathMatch && method === 'GET') {
    const row = getWordlist(decodeURIComponent(pathMatch[1]))
    if (!row) { json(res, { error: 'Not found' }, 404); return true }
    json(res, { path: row.path, exists: existsSync(row.path) })
    return true
  }

  return false
}
