import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assertNotProdDb } from '@/lib/db-guardrail'

describe('assertNotProdDb', () => {
  const ORIGINAL_ARGV = [...process.argv]

  beforeEach(() => {
    // Defensive baseline so the local .env.local of any contributor
    // (which may set PROD_DATABASE_HOSTNAME after this PR ships) does
    // not bleed into the "is a no-op when unset" test.
    vi.stubEnv('PROD_DATABASE_HOSTNAME', '')
    vi.stubEnv('NODE_ENV', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    process.argv = [...ORIGINAL_ARGV]
  })

  it('throws when the URL hostname matches PROD_DATABASE_HOSTNAME', () => {
    vi.stubEnv('PROD_DATABASE_HOSTNAME', 'ep-prod-host.neon.tech')
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).toThrow(/refusing to run against prod hostname/)
  })

  it('passes when the hostname does not match', () => {
    vi.stubEnv('PROD_DATABASE_HOSTNAME', 'ep-prod-host.neon.tech')
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-dev-host.neon.tech/db'),
    ).not.toThrow()
  })

  it('is a no-op when PROD_DATABASE_HOSTNAME is unset', () => {
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).not.toThrow()
  })

  it('is a no-op when NODE_ENV=production (app runtime path)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PROD_DATABASE_HOSTNAME', 'ep-prod-host.neon.tech')
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).not.toThrow()
  })

  it('bypasses with --i-know-this-is-prod flag', () => {
    vi.stubEnv('PROD_DATABASE_HOSTNAME', 'ep-prod-host.neon.tech')
    process.argv = [...process.argv, '--i-know-this-is-prod']
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).not.toThrow()
  })
})
