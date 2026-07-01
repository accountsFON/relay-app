import { describe, it, expect } from 'vitest'
import { greetingName } from '@/lib/greeting'

describe('greetingName', () => {
  it('returns the full name for a business name (no first-token shortening)', () => {
    expect(greetingName('Old Plank')).toBe('Old Plank')
  })

  it('returns the full name for a person (does not shorten to first name)', () => {
    expect(greetingName('Sarah Smith')).toBe('Sarah Smith')
  })

  it('trims surrounding whitespace', () => {
    expect(greetingName('  Old Plank  ')).toBe('Old Plank')
  })

  it('collapses internal whitespace', () => {
    expect(greetingName('Old   Plank')).toBe('Old Plank')
  })

  it('falls back to "there" for an empty or whitespace-only name', () => {
    expect(greetingName('')).toBe('there')
    expect(greetingName('   ')).toBe('there')
  })

  it('falls back to "there" for null/undefined', () => {
    expect(greetingName(null)).toBe('there')
    expect(greetingName(undefined)).toBe('there')
  })
})
