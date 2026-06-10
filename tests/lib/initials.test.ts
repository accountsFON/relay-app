import { describe, it, expect } from 'vitest'
import { initials } from '@/lib/initials'

describe('initials', () => {
  it('takes first + last initial for a full name', () => {
    expect(initials('Julio Aleman')).toBe('JA')
  })
  it('takes the first two letters of a single name', () => {
    expect(initials('Caleb')).toBe('CA')
  })
  it('ignores extra whitespace', () => {
    expect(initials('  Mollie   Huebner  ')).toBe('MH')
  })
  it('falls back to ? for empty input', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})
