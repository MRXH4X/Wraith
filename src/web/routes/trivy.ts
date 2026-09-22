import { spawn } from 'node:child_process'
import { readBody, json } from '../http-helpers.js'
import type { RouteContext } from './types.js'

// Strict image name validation — only allow characters safe for docker image references.
// This prevents command injection even though we use spawn (not shell: true).
const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]{0,254}$/

function validateImage(image: unknown): string | null {
  if (typeof image !== 'string') return null
  const trimmed = image.trim()
  if (!IMAGE_RE.test(trimmed)) return null
  return trimmed
}

function runTrivy(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn('trivy', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ stdout, stderr: stderr + '\n[TIMEOUT]', code: -1 })
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? -1 })
    })
  })
}

export async function tryHandleTrivy(ctx: RouteContext): Promise<boolean> {
  const { req, res, path, method } = ctx
  if (!path.startsWith('/api/trivy')) return false

  // POST /api/trivy/scan — run trivy image scan, return CVE table
  if (path === '/api/trivy/scan' && method === 'POST') {
    const body = await readBody(req)
    let data: any
    try { data = JSON.parse(body.toString()) } catch {
      json(res, { error: 'invalid JSON' }, 400); return true
    }

    const image = validateImage(data?.image)
    if (!image) {
      json(res, { error: 'invalid image name' }, 400); return true
    }

    const { stdout, stderr, code } = await runTrivy([
      'image', '--format', 'json', '--quiet', '--no-progress', image,
    ])

    if (code !== 0 && !stdout) {
      const msg = stderr.includes('[TIMEOUT]') ? 'scan timed out (120s)' : `trivy exited ${code}: ${stderr.slice(0, 300)}`
      json(res, { error: msg }, 500); return true
    }

    let trivyJson: any
    try { trivyJson = JSON.parse(stdout) } catch {
      json(res, { error: 'trivy output parse error', raw: stdout.slice(0, 500) }, 500); return true
    }

    const results: any[] = trivyJson.Results ?? []
    const vulns: any[] = []
    for (const r of results) {
      for (const v of (r.Vulnerabilities ?? [])) {
        vulns.push({
          id:           v.VulnerabilityID,
          pkg:          v.PkgName,
          installed:    v.InstalledVersion,
          fixed:        v.FixedVersion ?? null,
          severity:     v.Severity,
          score:        v.CVSS?.nvd?.V3Score ?? v.CVSS?.redhat?.V3Score ?? null,
          title:        v.Title ?? '',
          target:       r.Target,
        })
      }
    }

    // Sort: CRITICAL → HIGH → MEDIUM → LOW → UNKNOWN
    const SEV_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 }
    vulns.sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4))

    const counts = vulns.reduce((acc: Record<string, number>, v) => {
      acc[v.severity] = (acc[v.severity] ?? 0) + 1; return acc
    }, {})

    json(res, {
      image,
      total:    vulns.length,
      counts,
      vulns,
      metadata: { trivyVersion: trivyJson.SchemaVersion, artifactType: trivyJson.ArtifactType },
    })
    return true
  }

  // POST /api/trivy/sbom — return CycloneDX SBOM JSON
  if (path === '/api/trivy/sbom' && method === 'POST') {
    const body = await readBody(req)
    let data: any
    try { data = JSON.parse(body.toString()) } catch {
      json(res, { error: 'invalid JSON' }, 400); return true
    }

    const image = validateImage(data?.image)
    if (!image) {
      json(res, { error: 'invalid image name' }, 400); return true
    }

    const { stdout, stderr, code } = await runTrivy([
      'image', '--format', 'cyclonedx', '--quiet', '--no-progress', image,
    ])

    if (code !== 0 && !stdout) {
      const msg = stderr.includes('[TIMEOUT]') ? 'scan timed out (120s)' : `trivy exited ${code}`
      json(res, { error: msg }, 500); return true
    }

    let sbom: any
    try { sbom = JSON.parse(stdout) } catch {
      json(res, { error: 'sbom parse error' }, 500); return true
    }

    json(res, { image, sbom })
    return true
  }

  return false
}
