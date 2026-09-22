import { readBody, json } from '../http-helpers.js'
import type { RouteContext } from './types.js'

// ── Types ────────────────────────────────────────────────────────────────────

type LineType = 'info' | 'success' | 'failure' | 'unknown'
type Protocol = 'SMB' | 'LDAP' | 'MSSQL' | 'WINRM' | 'SSH' | string

export interface CmeRecord {
  protocol:    Protocol
  ip:          string
  port:        number
  hostname:    string
  domain:      string
  lineType:    LineType
  username:    string
  secret:      string     // password or hash (raw)
  lmHash:      string     // LM part if hash spray
  ntHash:      string     // NT part if hash spray
  isHash:      boolean
  hashcatMode: number | null  // 1000=NTLM, 5600=NTLMv2, null=plaintext
  pwned:       boolean    // (Pwn3d!) present
  signing:     boolean | null  // null = not an info line
  signingFalse: boolean   // relay target flag
  statusCode:  string     // e.g. STATUS_LOGON_FAILURE
  lockedOut:   boolean    // ACCOUNT_LOCKED_OUT
  raw:         string
}

interface ParseResult {
  records:  CmeRecord[]
  summary:  CmeSummary
}

interface CmeSummary {
  total:       number
  hosts:       number
  pwned:       number
  valid:       number
  failed:      number
  relayTargets: number   // signing:False hosts
  lockedAccounts: number
  creds:       number    // unique user:secret combos
}

// ── Parser ───────────────────────────────────────────────────────────────────

// Matches: SMB   10.10.10.100  445  DC01   [*|+|-] <rest>
const LINE_RE = /^(\w+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+\[([\*\+\-])\]\s+(.*)$/

// Info line fields from [*] line
const INFO_NAME_RE   = /\(name:([^)]+)\)/
const INFO_DOMAIN_RE = /\(domain:([^)]+)\)/
const INFO_SIGN_RE   = /\(signing:(True|False)\)/

// Credential from [+]/[-]: domain\user:secret  OR  domain\user
const CRED_RE = /^([^\\\s]+)\\([^:]+):(.+?)(?:\s+(.*))?$/

// LM:NT hash pattern (NTLM, hashcat mode 1000)
const HASH_RE = /^([0-9a-fA-F]{32}):([0-9a-fA-F]{32})$/
// NTLMv2 capture from Responder: user::domain:challenge:NTProofStr:blob (hashcat mode 5600)
const NTLMV2_RE = /^[^:]+::[^:]+:[0-9a-fA-F]{16}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$/

// Status code at end of failure line
const STATUS_RE = /\b(STATUS_\w+)\b/

function parseLine(raw: string): CmeRecord | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const m = trimmed.match(LINE_RE)
  if (!m) return null

  const [, protocol, ip, portStr, hostname, flag, rest] = m
  const port     = parseInt(portStr, 10)
  const lineType: LineType = flag === '*' ? 'info' : flag === '+' ? 'success' : 'failure'

  const rec: CmeRecord = {
    protocol, ip, port, hostname,
    domain: '', lineType,
    username: '', secret: '', lmHash: '', ntHash: '',
    isHash: false, hashcatMode: null, pwned: false,
    signing: null, signingFalse: false,
    statusCode: '', lockedOut: false, raw: trimmed,
  }

  if (lineType === 'info') {
    rec.domain   = rest.match(INFO_DOMAIN_RE)?.[1] ?? ''
    const signStr = rest.match(INFO_SIGN_RE)?.[1]
    if (signStr) {
      rec.signing      = signStr === 'True'
      rec.signingFalse = signStr === 'False'
    }
    return rec
  }

  // success / failure: extract cred
  const pwned = rest.includes('(Pwn3d!)')
  rec.pwned = pwned

  const statusMatch = rest.match(STATUS_RE)
  if (statusMatch) {
    rec.statusCode = statusMatch[1]
    rec.lockedOut  = rec.statusCode === 'STATUS_ACCOUNT_LOCKED_OUT'
  }

  // Strip trailing (Pwn3d!) and status codes to isolate cred string
  const credStr = rest
    .replace(/\s*\(Pwn3d!\)/g, '')
    .replace(/\bSTATUS_\w+/g, '')
    .trim()

  const credMatch = credStr.match(CRED_RE)
  if (credMatch) {
    const [, domain, username, secret] = credMatch
    rec.domain   = domain
    rec.username = username
    rec.secret   = secret.trim()

    const hashMatch = rec.secret.match(HASH_RE)
    if (hashMatch) {
      rec.isHash      = true
      rec.lmHash      = hashMatch[1]
      rec.ntHash      = hashMatch[2]
      rec.hashcatMode = 1000  // NTLM
    } else if (NTLMV2_RE.test(rec.secret)) {
      rec.isHash      = true
      rec.hashcatMode = 5600  // NTLMv2
    }
  }

  return rec
}

export function parseCme(raw: string): ParseResult {
  const lines   = raw.split(/\r?\n/)
  const records = lines.map(parseLine).filter((r): r is CmeRecord => r !== null)

  const hosts        = new Set(records.map(r => r.ip))
  const relayTargets = new Set(
    records.filter(r => r.signingFalse).map(r => r.ip)
  )
  const credSet = new Set(
    records
      .filter(r => r.lineType === 'success' && r.username)
      .map(r => `${r.domain}\\${r.username}:${r.secret}`)
  )

  const summary: CmeSummary = {
    total:          records.length,
    hosts:          hosts.size,
    pwned:          records.filter(r => r.pwned).length,
    valid:          records.filter(r => r.lineType === 'success' && !r.pwned).length,
    failed:         records.filter(r => r.lineType === 'failure').length,
    relayTargets:   relayTargets.size,
    lockedAccounts: records.filter(r => r.lockedOut).length,
    creds:          credSet.size,
  }

  return { records, summary }
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function tryHandleCmeParser(ctx: RouteContext): Promise<boolean> {
  const { req, res, path, method } = ctx
  if (!path.startsWith('/api/nxc')) return false

  // POST /api/nxc/parse — pure parse, no DB writes
  if (path === '/api/nxc/parse' && method === 'POST') {
    const body = await readBody(req)
    let data: any
    try { data = JSON.parse(body.toString()) } catch {
      json(res, { error: 'invalid JSON' }, 400); return true
    }
    if (typeof data?.raw !== 'string') {
      json(res, { error: 'raw field required' }, 400); return true
    }
    const result = parseCme(data.raw)
    json(res, result)
    return true
  }

  // POST /api/nxc/import — parse + vault-loot import via self-HTTP
  if (path === '/api/nxc/import' && method === 'POST') {
    const body = await readBody(req)
    let data: any
    try { data = JSON.parse(body.toString()) } catch {
      json(res, { error: 'invalid JSON' }, 400); return true
    }
    if (typeof data?.raw !== 'string') {
      json(res, { error: 'raw field required' }, 400); return true
    }

    const { records, summary } = parseCme(data.raw)

    // Import successes to vault via the internal /api/vault/secrets endpoint
    const toImport = records.filter(r => r.lineType === 'success' && r.username && r.secret)
    const authHeader = req.headers['authorization'] ?? ''
    const baseUrl    = `http://127.0.0.1:${process.env.WEB_PORT ?? 3420}`

    let vaultImported = 0
    let vaultSkipped  = 0

    for (const rec of toImport) {
      const domUser = rec.domain ? `${rec.domain}\\${rec.username}` : rec.username
      const label   = `${domUser}@${rec.hostname} (${rec.ip})`
      const tags    = ['nxc', rec.protocol.toLowerCase()]
      if (rec.pwned)  tags.push('pwned', 'local-admin')
      if (rec.isHash) tags.push('hash', 'ntlm')
      if (rec.isHash && rec.hashcatMode === 5600) tags.push('ntlmv2')

      const payload = {
        label,
        value:   rec.secret,
        kind:    rec.isHash ? 'hash' : 'credential',
        context: `nxc ${rec.protocol} | ${rec.ip}:${rec.port} | ${rec.hostname}${rec.pwned ? ' | PWNED (local admin)' : ''}${rec.isHash ? ` | hashcat -m ${rec.hashcatMode}` : ''}`,
        tags,
      }

      try {
        const r = await fetch(`${baseUrl}/api/vault/secrets`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(5000),
        })
        if (r.status === 201) vaultImported++
        else if (r.status === 409) vaultSkipped++  // duplicate
        else vaultSkipped++
      } catch {
        vaultSkipped++
      }
    }

    json(res, {
      summary,
      import: { total: toImport.length, imported: vaultImported, skipped: vaultSkipped },
      lockedOutAlert: summary.lockedAccounts > 0
        ? `FIGYELEM: ${summary.lockedAccounts} ACCOUNT_LOCKED_OUT találat!`
        : null,
      relayTargetAlert: summary.relayTargets > 0
        ? `${summary.relayTargets} relay target (signing:False): ${
            records.filter(r => r.signingFalse).map(r => r.ip).filter((v, i, a) => a.indexOf(v) === i).join(', ')
          }`
        : null,
    })
    return true
  }

  return false
}
