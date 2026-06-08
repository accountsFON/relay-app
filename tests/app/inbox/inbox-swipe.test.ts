import { describe, it, expect } from 'vitest'
import { shouldDismiss } from '@/app/(app)/inbox/inbox-swipe'

describe('shouldDismiss', () => {
  it('is true when a left swipe passes the default 45% threshold', () => {
    expect(shouldDismiss(-100, 200)).toBe(true) // 50%
  })
  it('is false when a left swipe is under the threshold', () => {
    expect(shouldDismiss(-50, 200)).toBe(false) // 25%
  })
  it('ignores rightward swipes', () => {
    expect(shouldDismiss(100, 200)).toBe(false)
  })
  it('is false for a zero-width row (avoids divide-by-zero true)', () => {
    expect(shouldDismiss(-100, 0)).toBe(false)
  })
})
