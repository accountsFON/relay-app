import { describe, it, expect } from 'vitest'
import { calculatePostingDates } from '@/server/services/dateCalculator'

describe('calculatePostingDates', () => {
  it('returns Mon/Wed/Fri dates for a known month', () => {
    const result = calculatePostingDates('2026-05', 'Mon,Wed,Fri', [], 'Off')
    const days = result.postingDates.map((d) => d.day)
    expect(days.every((d) => ['Mon', 'Wed', 'Fri'].includes(d))).toBe(true)
    expect(result.postingDates.length).toBeGreaterThan(10)
  })

  it('filters by posting days correctly', () => {
    const result = calculatePostingDates('2026-06', 'Tue,Thu', [], 'Off')
    const days = new Set(result.postingDates.map((d) => d.day))
    expect(days.has('Tue')).toBe(true)
    expect(days.has('Thu')).toBe(true)
    expect(days.has('Mon')).toBe(false)
  })

  it('excludes specified dates', () => {
    const result = calculatePostingDates(
      '2026-05',
      'Mon,Wed,Fri',
      ['2026-05-04', '2026-05-06'],
      'Off'
    )
    const dates = result.postingDates.map((d) => d.date)
    expect(dates).not.toContain('2026-05-04')
    expect(dates).not.toContain('2026-05-06')
  })

  it('detects Independence Day in July 2026', () => {
    const result = calculatePostingDates('2026-07', 'Mon,Tue,Wed,Thu,Fri,Sat', [], 'Major-US')
    expect(result.holidaysInMonth.some((h) => h.includes('Independence Day'))).toBe(true)

    const july4 = result.postingDates.find((d) => d.date === '2026-07-04')
    if (july4) {
      expect(july4.isHoliday).toBe(true)
      expect(july4.holidayName).toBe('Independence Day')
    }
  })

  it('detects Thanksgiving in November 2026', () => {
    const result = calculatePostingDates('2026-11', 'Mon,Tue,Wed,Thu,Fri', [], 'Major-US')
    expect(result.holidaysInMonth.some((h) => h.includes('Thanksgiving'))).toBe(true)
    const thanksgiving = result.postingDates.find((d) => d.holidayName === 'Thanksgiving')
    expect(thanksgiving).toBeDefined()
    expect(thanksgiving!.date).toBe('2026-11-26')
  })

  it('detects Christmas in December 2026', () => {
    const result = calculatePostingDates('2026-12', 'Mon,Tue,Wed,Thu,Fri', [], 'Major-US')
    expect(result.holidaysInMonth.some((h) => h.includes('Christmas'))).toBe(true)
  })

  it('skips holidays when handling is Off', () => {
    const result = calculatePostingDates('2026-07', 'Mon,Tue,Wed,Thu,Fri', [], 'Off')
    expect(result.holidaysInMonth).toHaveLength(0)
    const july4 = result.postingDates.find((d) => d.date === '2026-07-04')
    if (july4) {
      expect(july4.isHoliday).toBeUndefined()
    }
  })

  it('handles full day name variants', () => {
    const result = calculatePostingDates('2026-05', 'Monday, Wednesday, Friday', [], 'Off')
    const days = new Set(result.postingDates.map((d) => d.day))
    expect(days.has('Mon')).toBe(true)
    expect(days.has('Wed')).toBe(true)
    expect(days.has('Fri')).toBe(true)
  })

  it('tags holiday eves', () => {
    const result = calculatePostingDates('2026-07', 'Mon,Tue,Wed,Thu,Fri', [], 'Major-US')
    expect(result.holidayTags.some((t) => t.includes('Eve of Independence Day'))).toBe(true)
  })

  it('handles invalid month gracefully', () => {
    const result = calculatePostingDates('invalid', 'Mon,Wed,Fri', [], 'Off')
    expect(result.postingDates.length).toBeGreaterThan(0)
  })

  it('returns dates in chronological order', () => {
    const result = calculatePostingDates('2026-05', 'Mon,Wed,Fri', [], 'Off')
    for (let i = 1; i < result.postingDates.length; i++) {
      expect(result.postingDates[i].date > result.postingDates[i - 1].date).toBe(true)
    }
  })
})
