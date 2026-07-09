import { describe, it, expect } from 'vitest'
import { formatDateInputValue, addDays, daysUntilDate } from '@/lib/expiry-date'

describe('expiry-date helpers', () => {
  it('formatDateInputValue formats a Date as local YYYY-MM-DD', () => {
    // month is 0-indexed: 6 = July
    expect(formatDateInputValue(new Date(2026, 6, 9))).toBe('2026-07-09')
    expect(formatDateInputValue(new Date(2026, 0, 3))).toBe('2026-01-03')
  })

  it('addDays advances by calendar days (and rolls the month)', () => {
    expect(formatDateInputValue(addDays(new Date(2026, 6, 9), 7))).toBe('2026-07-16')
    expect(formatDateInputValue(addDays(new Date(2026, 6, 28), 7))).toBe('2026-08-04')
  })

  it('daysUntilDate counts whole days from the from-date local midnight', () => {
    const from = new Date(2026, 6, 9, 15, 30) // afternoon of Jul 9
    expect(daysUntilDate('2026-07-16', from)).toBe(7)
    expect(daysUntilDate('2026-07-10', from)).toBe(1)
    expect(daysUntilDate('2026-07-09', from)).toBe(0)
  })

  it('daysUntilDate returns a negative for a past date', () => {
    expect(daysUntilDate('2026-07-08', new Date(2026, 6, 9))).toBe(-1)
  })
})
