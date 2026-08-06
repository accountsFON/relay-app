import { describe, it, expect } from 'vitest'
import { CLIENT_PAGE_TOOLTIP_COPY } from '@/lib/client-page-tooltip-copy'

const REQUIRED_KEYS = ['sendToReview', 'approveSchedule', 'requestChanges', 'generateContent'] as const

describe('CLIENT_PAGE_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(CLIENT_PAGE_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })
  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(CLIENT_PAGE_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
