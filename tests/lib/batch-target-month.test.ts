import { describe, it, expect } from 'vitest'
import {
  resolveBatchTargetMonth,
  parseLabel,
  formatMonthYear,
  buildBatchLabel,
} from '@/lib/batch-target-month'

describe('parseLabel', () => {
  const fallback = new Date('2026-05-15')

  it('parses the new "Client Name Month Year" format', () => {
    expect(parseLabel('Cedar Creek Dental May 2026', fallback)).toBe('2026-05')
  })

  it('parses a multi-word client name with trailing Month Year', () => {
    expect(parseLabel('Akkoo Coffee March 2027', fallback)).toBe('2027-03')
  })

  it('still parses the legacy "April 2026" format', () => {
    expect(parseLabel('April 2026', fallback)).toBe('2026-04')
  })

  it('still parses month-only labels using the fallback year', () => {
    expect(parseLabel('April', fallback)).toBe('2026-04')
  })

  it('still parses YYYY-MM labels', () => {
    expect(parseLabel('2026-04', fallback)).toBe('2026-04')
  })

  it('returns null for unparseable labels', () => {
    expect(parseLabel('Special batch', fallback)).toBeNull()
    expect(parseLabel('Cedar Creek Q1 2026', fallback)).toBeNull()
  })

  it('returns null when the trailing word is not a real month name', () => {
    expect(parseLabel('Cedar Creek Dental 2026', fallback)).toBeNull()
  })
})

describe('formatMonthYear', () => {
  it('renders a YYYY-MM target month as "Month Year"', () => {
    expect(formatMonthYear('2026-05')).toBe('May 2026')
    expect(formatMonthYear('2026-01')).toBe('January 2026')
    expect(formatMonthYear('2027-12')).toBe('December 2027')
  })
})

describe('buildBatchLabel', () => {
  it('composes "{Client Name} {Month Year}"', () => {
    expect(buildBatchLabel('Cedar Creek Dental', '2026-05')).toBe(
      'Cedar Creek Dental May 2026',
    )
  })

  it('round-trips through parseLabel', () => {
    const label = buildBatchLabel('Cedar Creek Dental', '2026-05')
    expect(parseLabel(label, new Date())).toBe('2026-05')
  })
})

describe('resolveBatchTargetMonth', () => {
  it('uses run.targetMonth when run is provided', () => {
    const batch = { label: 'Whatever', createdAt: new Date('2026-04-01') }
    const run = { targetMonth: '2026-05' }
    expect(resolveBatchTargetMonth(batch, run)).toBe('2026-05')
  })

  it('parses batch.label when run is null and label looks like a month', () => {
    const batch = { label: 'April 2026', createdAt: new Date('2026-04-01') }
    expect(resolveBatchTargetMonth(batch, null)).toBe('2026-04')
  })

  it('parses month-only label using batch.createdAt year', () => {
    const batch = { label: 'April', createdAt: new Date('2026-04-15') }
    expect(resolveBatchTargetMonth(batch, null)).toBe('2026-04')
  })

  it('falls back to current month when label is unparseable and no run', () => {
    const now = new Date('2026-05-11T12:00:00Z')
    const batch = { label: 'Special batch', createdAt: new Date('2026-05-01') }
    expect(resolveBatchTargetMonth(batch, null, now)).toBe('2026-05')
  })

  it('prefers run over label when both are available', () => {
    const batch = { label: 'April', createdAt: new Date('2026-04-01') }
    const run = { targetMonth: '2026-05' }
    expect(resolveBatchTargetMonth(batch, run)).toBe('2026-05')
  })
})
