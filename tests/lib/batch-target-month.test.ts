import { describe, it, expect } from 'vitest'
import { resolveBatchTargetMonth } from '@/lib/batch-target-month'

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
