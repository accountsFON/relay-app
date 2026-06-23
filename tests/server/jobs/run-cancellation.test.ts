import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { contentRun: { findUnique: vi.fn() } },
}))

import { db } from '@/db/client'
import { isRunCancelled } from '@/server/jobs/run-cancellation'

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
