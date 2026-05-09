import { describe, expect, it } from 'vitest'
import {
  parseDateScope,
  resolveDateScope,
  serializeDateScope,
  dateScopeIncludesMonth,
  dateScopeLabel,
  defaultDateScope,
} from '@/lib/date-scope'

const NOW = new Date(2026, 4, 9) // 2026-05-09

describe('date-scope', () => {
  describe('resolveDateScope', () => {
    it('this_month spans the current calendar month', () => {
      const s = resolveDateScope({ preset: 'this_month' }, NOW)
      expect(s.from?.toISOString()).toBe(new Date(2026, 4, 1).toISOString())
      expect(s.to?.toISOString()).toBe(new Date(2026, 5, 1).toISOString())
    })

    it('last_month spans the prior month', () => {
      const s = resolveDateScope({ preset: 'last_month' }, NOW)
      expect(s.from?.toISOString()).toBe(new Date(2026, 3, 1).toISOString())
      expect(s.to?.toISOString()).toBe(new Date(2026, 4, 1).toISOString())
    })

    it('last_3_months spans rolling 3 calendar months including current', () => {
      const s = resolveDateScope({ preset: 'last_3_months' }, NOW)
      expect(s.from?.toISOString()).toBe(new Date(2026, 2, 1).toISOString())
      expect(s.to?.toISOString()).toBe(new Date(2026, 5, 1).toISOString())
    })

    it('this_year spans the current calendar year', () => {
      const s = resolveDateScope({ preset: 'this_year' }, NOW)
      expect(s.from?.toISOString()).toBe(new Date(2026, 0, 1).toISOString())
      expect(s.to?.toISOString()).toBe(new Date(2027, 0, 1).toISOString())
    })

    it('all_time caps at 2 years and is upper-unbounded', () => {
      const s = resolveDateScope({ preset: 'all_time' }, NOW)
      expect(s.from?.toISOString()).toBe(new Date(2024, 4, 1).toISOString())
      expect(s.to).toBeNull()
    })
  })

  describe('parseDateScope', () => {
    it('returns default when no params', () => {
      const s = parseDateScope({}, NOW)
      expect(s.preset).toBe('this_month')
    })

    it('parses preset string', () => {
      const s = parseDateScope({ scope: 'last_month' }, NOW)
      expect(s.preset).toBe('last_month')
    })

    it('parses custom range', () => {
      const s = parseDateScope(
        { scope: 'custom', from: '2026-01-15', to: '2026-03-20' },
        NOW,
      )
      expect(s.preset).toBe('custom')
      expect(s.from?.toISOString()).toBe(new Date(2026, 0, 15).toISOString())
      // exclusive upper bound: stored as next day
      expect(s.to?.toISOString()).toBe(new Date(2026, 2, 21).toISOString())
    })

    it('falls back to default on invalid custom', () => {
      const s = parseDateScope(
        { scope: 'custom', from: 'bad', to: 'bad' },
        NOW,
      )
      expect(s.preset).toBe('this_month')
    })

    it('falls back to default on unknown preset', () => {
      const s = parseDateScope({ scope: 'gibberish' }, NOW)
      expect(s.preset).toBe('this_month')
    })
  })

  describe('serializeDateScope', () => {
    it('omits params for default', () => {
      const s = defaultDateScope(NOW)
      expect(serializeDateScope(s)).toEqual({})
    })

    it('serializes named preset', () => {
      const s = resolveDateScope({ preset: 'last_3_months' }, NOW)
      expect(serializeDateScope(s)).toEqual({ scope: 'last_3_months' })
    })

    it('serializes custom range as inclusive day', () => {
      const s = parseDateScope(
        { scope: 'custom', from: '2026-01-15', to: '2026-03-20' },
        NOW,
      )
      expect(serializeDateScope(s)).toEqual({
        scope: 'custom',
        from: '2026-01-15',
        to: '2026-03-20',
      })
    })
  })

  describe('dateScopeIncludesMonth', () => {
    it('this_month includes the current month', () => {
      const s = resolveDateScope({ preset: 'this_month' }, NOW)
      expect(dateScopeIncludesMonth(s, '2026-05')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2026-04')).toBe(false)
      expect(dateScopeIncludesMonth(s, '2026-06')).toBe(false)
    })

    it('last_3_months includes the rolling window', () => {
      const s = resolveDateScope({ preset: 'last_3_months' }, NOW)
      expect(dateScopeIncludesMonth(s, '2026-03')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2026-04')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2026-05')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2026-02')).toBe(false)
    })

    it('all_time accepts everything within the 2-year cap', () => {
      const s = resolveDateScope({ preset: 'all_time' }, NOW)
      // 24 months back from 2026-05 is 2024-05.
      expect(dateScopeIncludesMonth(s, '2026-05')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2025-01')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2024-05')).toBe(true)
      expect(dateScopeIncludesMonth(s, '2024-04')).toBe(false)
    })

    it('returns true for unparseable months (defensive)', () => {
      const s = resolveDateScope({ preset: 'this_month' }, NOW)
      expect(dateScopeIncludesMonth(s, 'bad-input')).toBe(true)
    })
  })

  describe('dateScopeLabel', () => {
    it('returns preset label', () => {
      const s = resolveDateScope({ preset: 'last_month' }, NOW)
      expect(dateScopeLabel(s)).toBe('Last month')
    })

    it('returns short range for custom', () => {
      const s = parseDateScope(
        { scope: 'custom', from: '2026-01-15', to: '2026-03-20' },
        NOW,
      )
      expect(dateScopeLabel(s)).toMatch(/Jan 15.*Mar 21/)
    })
  })
})
