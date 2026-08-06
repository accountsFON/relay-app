import { describe, it, expect } from 'vitest'
import { PERMISSION_KEYS, PERMISSION_DESCRIPTIONS } from '@/server/auth/permissions'

describe('PERMISSION_DESCRIPTIONS', () => {
  it('has a non-empty description for every permission key', () => {
    for (const key of PERMISSION_KEYS) {
      expect(PERMISSION_DESCRIPTIONS[key], `missing description for ${key}`).toBeTruthy()
    }
  })

  it('obeys the Wave 4K copy rules', () => {
    for (const key of PERMISSION_KEYS) {
      const value = PERMISSION_DESCRIPTIONS[key]
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
