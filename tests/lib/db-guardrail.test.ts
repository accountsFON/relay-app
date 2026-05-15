import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertNotProdDb } from '@/lib/db-guardrail'

describe('assertNotProdDb', () => {
  const ORIGINAL_ENV = { ...process.env }
  const ORIGINAL_ARGV = [...process.argv]

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.argv = [...ORIGINAL_ARGV]
    delete process.env.PROD_DATABASE_HOSTNAME
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
    process.argv = ORIGINAL_ARGV
  })

  it('throws when the URL hostname matches PROD_DATABASE_HOSTNAME', () => {
    process.env.PROD_DATABASE_HOSTNAME = 'ep-prod-host.neon.tech'
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).toThrow(/refusing to run against prod hostname/)
  })

  it('passes when the hostname does not match', () => {
    process.env.PROD_DATABASE_HOSTNAME = 'ep-prod-host.neon.tech'
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
    process.env.NODE_ENV = 'production'
    process.env.PROD_DATABASE_HOSTNAME = 'ep-prod-host.neon.tech'
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).not.toThrow()
  })

  it('bypasses with --i-know-this-is-prod flag', () => {
    process.env.PROD_DATABASE_HOSTNAME = 'ep-prod-host.neon.tech'
    process.argv = [...process.argv, '--i-know-this-is-prod']
    expect(() =>
      assertNotProdDb('postgresql://u:p@ep-prod-host.neon.tech/db'),
    ).not.toThrow()
  })
})
