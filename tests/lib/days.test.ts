import { describe, it, expect } from 'vitest'
import { daysSince } from '@/lib/days'

const DAY = 24 * 60 * 60 * 1000

describe('daysSince', () => {
  const now = new Date('2026-08-07T12:00:00Z').getTime()

  it('is 0 for a date less than a full day ago', () => {
    expect(daysSince(new Date(now - 1000), now)).toBe(0)
    expect(daysSince(new Date(now - (DAY - 1)), now)).toBe(0)
  })

  it('counts whole elapsed days, flooring partial days', () => {
    expect(daysSince(new Date(now - DAY), now)).toBe(1)
    expect(daysSince(new Date(now - (DAY + DAY / 2)), now)).toBe(1)
    expect(daysSince(new Date(now - 5 * DAY), now)).toBe(5)
  })

  it('clamps to 0 for a future date (never negative)', () => {
    expect(daysSince(new Date(now + DAY), now)).toBe(0)
  })

  it('is pure: same inputs always give the same result', () => {
    const d = new Date(now - 3 * DAY)
    expect(daysSince(d, now)).toBe(daysSince(d, now))
  })
})
