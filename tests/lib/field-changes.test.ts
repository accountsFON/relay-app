import { describe, it, expect } from 'vitest'
import { formatFieldValue, diffFieldChanges } from '@/lib/field-changes'

describe('formatFieldValue', () => {
  it('renders null / empty as (empty)', () => {
    expect(formatFieldValue(null)).toBe('(empty)')
    expect(formatFieldValue(undefined)).toBe('(empty)')
    expect(formatFieldValue('')).toBe('(empty)')
  })
  it('renders booleans as On/Off', () => {
    expect(formatFieldValue(true)).toBe('On')
    expect(formatFieldValue(false)).toBe('Off')
  })
  it('joins arrays and renders empty arrays as (empty)', () => {
    expect(formatFieldValue(['a', 'b'])).toBe('a, b')
    expect(formatFieldValue([])).toBe('(empty)')
  })
  it('stringifies other values', () => {
    expect(formatFieldValue('hello')).toBe('hello')
    expect(formatFieldValue(42)).toBe('42')
  })
  it('caps very long strings at 1000 chars with an ellipsis', () => {
    const out = formatFieldValue('x'.repeat(2000))
    expect(out.length).toBe(1001)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('diffFieldChanges', () => {
  it('returns one entry per changed field with formatted from/to', () => {
    const out = diffFieldChanges(
      { mainCta: 'Call now', focus1: 'A' },
      { mainCta: 'Book today', focus1: 'A' },
    )
    expect(out).toEqual([{ field: 'mainCta', from: 'Call now', to: 'Book today' }])
  })
  it('skips undefined "after" values (partial updates)', () => {
    const out = diffFieldChanges({ caption: 'old' }, { caption: undefined })
    expect(out).toEqual([])
  })
  it('detects array changes and formats them', () => {
    const out = diffFieldChanges({ urls: ['a'] }, { urls: ['a', 'b'] })
    expect(out).toEqual([{ field: 'urls', from: 'a', to: 'a, b' }])
  })
  it('uses the resolver override when provided (id -> name)', () => {
    const out = diffFieldChanges(
      { assignedAmId: 'u1' },
      { assignedAmId: 'u2' },
      (field, value) =>
        field === 'assignedAmId' ? ({ u1: 'Mollie', u2: 'Caleb' } as Record<string, string>)[value as string] : undefined,
    )
    expect(out).toEqual([{ field: 'assignedAmId', from: 'Mollie', to: 'Caleb' }])
  })
})
