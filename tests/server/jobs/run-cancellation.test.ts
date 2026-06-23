import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { contentRun: { findUnique: vi.fn(), updateMany: vi.fn() } },
}))

import { db } from '@/db/client'
import {
  isRunCancelled,
  markRunCompleteIfNotCancelled,
} from '@/server/jobs/run-cancellation'

describe('isRunCancelled', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when the run status is cancelled', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue({ status: 'cancelled' } as never)
    expect(await isRunCancelled('run-1')).toBe(true)
    expect(db.contentRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      select: { status: true },
    })
  })

  it('returns false for a non-cancelled status', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue({ status: 'running' } as never)
    expect(await isRunCancelled('run-1')).toBe(false)
  })

  it('returns false when the run is missing', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(null as never)
    expect(await isRunCancelled('run-1')).toBe(false)
  })
})

describe('markRunCompleteIfNotCancelled', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks complete and returns true when the run was not cancelled (count > 0)', async () => {
    vi.mocked(db.contentRun.updateMany).mockResolvedValue({ count: 1 } as never)

    const ok = await markRunCompleteIfNotCancelled('run-1', {
      totalCostUsd: 1,
      completedAt: new Date(),
    } as never)

    expect(ok).toBe(true)
    const call = vi.mocked(db.contentRun.updateMany).mock.calls[0][0]
    // The write is guarded on status so a concurrent cancel cannot be clobbered.
    expect(call.where).toEqual({ id: 'run-1', status: { not: 'cancelled' } })
    expect((call.data as { status?: string }).status).toBe('complete')
  })

  it('returns false (does not complete) when a cancel landed concurrently (count 0)', async () => {
    vi.mocked(db.contentRun.updateMany).mockResolvedValue({ count: 0 } as never)

    const ok = await markRunCompleteIfNotCancelled('run-1', {
      completedAt: new Date(),
    } as never)

    expect(ok).toBe(false)
  })
})
