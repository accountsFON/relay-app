import { describe, it, expect } from 'vitest'
import { isEmptyCompletedRun } from '@/lib/content-run-visibility'

describe('isEmptyCompletedRun', () => {
  it('hides a completed run whose posts are gone (purged content)', () => {
    expect(isEmptyCompletedRun({ status: 'complete', _count: { posts: 0 } })).toBe(true)
  })

  it('keeps a completed run that still has posts', () => {
    // A merely-archived batch keeps its post rows, so _count stays > 0 and
    // the run remains visible + clickable (it resolves to the archived batch).
    expect(isEmptyCompletedRun({ status: 'complete', _count: { posts: 12 } })).toBe(false)
  })

  it('keeps a failed run even with zero posts (it explains the failure / offers re-run)', () => {
    expect(isEmptyCompletedRun({ status: 'failed', _count: { posts: 0 } })).toBe(false)
  })

  it('keeps an in-progress run with zero posts (still generating)', () => {
    expect(isEmptyCompletedRun({ status: 'running', _count: { posts: 0 } })).toBe(false)
    expect(isEmptyCompletedRun({ status: 'queued', _count: { posts: 0 } })).toBe(false)
  })
})
