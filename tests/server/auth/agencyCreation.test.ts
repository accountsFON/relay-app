import { describe, it, expect, afterEach, vi } from 'vitest'
import { isAgencyCreationEnabled } from '@/server/auth/agencyCreation'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isAgencyCreationEnabled', () => {
  it('returns false when the env var is unset (invite-only default)', () => {
    vi.stubEnv('RELAY_ALLOW_AGENCY_CREATION', '')
    expect(isAgencyCreationEnabled()).toBe(false)
  })

  it('returns true only for the exact string "true"', () => {
    vi.stubEnv('RELAY_ALLOW_AGENCY_CREATION', 'true')
    expect(isAgencyCreationEnabled()).toBe(true)
  })

  it('returns false for any other truthy-looking value', () => {
    for (const v of ['1', 'TRUE', 'yes', 'on']) {
      vi.stubEnv('RELAY_ALLOW_AGENCY_CREATION', v)
      expect(isAgencyCreationEnabled()).toBe(false)
    }
  })
})
