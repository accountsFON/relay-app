import { describe, it, expect } from 'vitest'
import { PREVIEW_TOOLTIP_COPY } from '@/lib/preview-tooltip-copy'

const REQUIRED_KEYS = [
  'imageReplace',
  'bulkResolve',
  'markBatchReviewed',
  'commentImageRemove',
  'editCaption',
] as const

describe('PREVIEW_TOOLTIP_COPY', () => {
  it('has non-empty copy for every required control', () => {
    for (const key of REQUIRED_KEYS) {
      expect(PREVIEW_TOOLTIP_COPY[key], `missing copy for ${key}`).toBeTruthy()
    }
  })

  it('obeys the Wave 4K copy rules', () => {
    for (const [key, value] of Object.entries(PREVIEW_TOOLTIP_COPY)) {
      expect(value.length, `${key} must be under 80 chars`).toBeLessThan(80)
      expect(value, `${key} must not contain a dash`).not.toMatch(/[—–]| - /)
    }
  })
})
