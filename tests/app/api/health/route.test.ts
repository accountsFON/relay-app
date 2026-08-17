import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: { $queryRawUnsafe: (...args: unknown[]) => mocks.queryRawUnsafe(...args) },
}))

import { GET } from '@/app/api/health/route'

const VERCEL_VARS = [
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_ENV',
  'VERCEL_DEPLOYMENT_ID',
] as const

const REQUIRED_ENV = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'FIRECRAWL_API_KEY',
] as const

let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  for (const k of [...VERCEL_VARS, ...REQUIRED_ENV]) {
    saved[k] = process.env[k]
  }
  // Healthy baseline: every required env var present, database reachable.
  for (const k of REQUIRED_ENV) process.env[k] = 'set-for-test'
  for (const k of VERCEL_VARS) delete process.env[k]
  mocks.queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }])
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('reports the deployed commit so a ship can be verified without GitHub', async () => {
    // The whole point: during the 2026-08-17 GitHub outage neither the GitHub
    // deployment record nor the commit status appeared, so there was no way to
    // answer "is the thing I merged actually live?" without the Vercel CLI.
    process.env.VERCEL_GIT_COMMIT_SHA = 'aad00f2e1c9b4a7d3f5601928374650adbe12345'
    process.env.VERCEL_GIT_COMMIT_REF = 'main'
    process.env.VERCEL_ENV = 'production'
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_CufHpqydCeermDxrGftYo8UWWLYD'

    const res = await GET()
    const body = await res.json()

    expect(body.version).toEqual({
      commit: 'aad00f2',
      fullCommit: 'aad00f2e1c9b4a7d3f5601928374650adbe12345',
      branch: 'main',
      env: 'production',
      deploymentId: 'dpl_CufHpqydCeermDxrGftYo8UWWLYD',
    })
  })

  it('shortens the commit to the 7 characters git log prints', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = '8469c35abcdef0123456789abcdef0123456789a'

    const res = await GET()
    const body = await res.json()

    // So it can be eyeballed straight against `git log --oneline`.
    expect(body.version.commit).toBe('8469c35')
  })

  it('says "local" when the Vercel vars are absent, so dev is never mistaken for a deploy', async () => {
    const res = await GET()
    const body = await res.json()

    expect(body.version).toEqual({
      commit: 'local',
      fullCommit: null,
      branch: null,
      env: 'local',
      deploymentId: null,
    })
  })

  it('still reports the version when a check FAILS', async () => {
    // The most valuable case. A broken deploy is exactly when you need to know
    // which commit is serving, so version must not be gated behind status ok.
    process.env.VERCEL_GIT_COMMIT_SHA = 'deadbee1234567890abcdef1234567890abcdef1'
    mocks.queryRawUnsafe.mockRejectedValue(new Error('connection refused'))

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.version.commit).toBe('deadbee')
    expect(body.checks.database).toContain('FAILED')
  })

  it('still reports the version when an env var is MISSING', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'cafe1234567890abcdef1234567890abcdef1234'
    delete process.env.FIRECRAWL_API_KEY

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.version.commit).toBe('cafe123')
    expect(body.checks.env_firecrawl).toBe('MISSING')
  })

  it('keeps the existing status and checks contract intact', async () => {
    // Regression guard: the version block is additive. Anything already
    // watching status/checks must keep working.
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks).toEqual({
      env_database_url: 'set',
      env_clerk_secret: 'set',
      env_openai: 'set',
      env_anthropic: 'set',
      env_firecrawl: 'set',
      database: 'connected',
    })
  })

  it('never puts version data inside checks, which drives the ok/degraded verdict', async () => {
    // `allOk` scans every value in `checks` for MISSING/FAILED prefixes. A
    // branch or commit landing in there could flip the verdict by accident.
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234567890abcdef1234567890abcdef12345'
    process.env.VERCEL_GIT_COMMIT_REF = 'fix/MISSING-something'

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(Object.keys(body.checks)).not.toContain('commit')
    expect(Object.keys(body.checks)).not.toContain('branch')
  })
})
