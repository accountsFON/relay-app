import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelative, formatRelativeDays } from '@/lib/format-relative'

const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')

describe('formatRelative', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for sub-60-second diffs', () => {
    const d = new Date(FIXED_NOW.getTime() - 30 * 1000)
    expect(formatRelative(d)).toBe('just now')
  })

  it('returns "Nm ago" for minute-range diffs', () => {
    const d = new Date(FIXED_NOW.getTime() - 5 * 60 * 1000)
    expect(formatRelative(d)).toBe('5m ago')
  })

  it('returns "Nh ago" for hour-range diffs', () => {
    const d = new Date(FIXED_NOW.getTime() - 3 * 60 * 60 * 1000)
    expect(formatRelative(d)).toBe('3h ago')
  })

  it('returns "Nd ago" for diffs under 1 week', () => {
    const d = new Date(FIXED_NOW.getTime() - 4 * 24 * 60 * 60 * 1000)
    expect(formatRelative(d)).toBe('4d ago')
  })

  it('falls back to locale date string for diffs over 1 week', () => {
    const d = new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(formatRelative(d)).toBe(d.toLocaleDateString())
  })

  it('accepts an ISO string input', () => {
    const iso = new Date(FIXED_NOW.getTime() - 90 * 1000).toISOString()
    expect(formatRelative(iso)).toBe('1m ago')
  })
})

describe('formatRelativeDays', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "today" for diffs under 24 hours', () => {
    const d = new Date(FIXED_NOW.getTime() - 5 * 60 * 60 * 1000)
    expect(formatRelativeDays(d)).toBe('today')
  })

  it('returns "yesterday" for diffs 1 to 2 days', () => {
    const d = new Date(FIXED_NOW.getTime() - 25 * 60 * 60 * 1000)
    expect(formatRelativeDays(d)).toBe('yesterday')
  })

  it('returns "Nd ago" for 2 to 6 days', () => {
    const d = new Date(FIXED_NOW.getTime() - 4 * 24 * 60 * 60 * 1000)
    expect(formatRelativeDays(d)).toBe('4d ago')
  })

  it('falls back to locale date string for diffs over 1 week', () => {
    const d = new Date(FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000)
    expect(formatRelativeDays(d)).toBe(d.toLocaleDateString())
  })
})
