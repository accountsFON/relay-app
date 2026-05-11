/**
 * Tests for findRunForBatch. Uses the mock pattern consistent with the
 * existing repository test suite (see tests/server/repositories/clients.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    post: {
      findFirst: vi.fn(),
    },
    contentRun: {
      findUnique: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import { findRunForBatch } from '@/server/repositories/contentRuns'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findRunForBatch', () => {
  it('returns the run that produced posts in this batch', async () => {
    vi.mocked(db.post.findFirst).mockResolvedValue({
      contentRunId: 'run_1',
    } as never)
    vi.mocked(db.contentRun.findUnique).mockResolvedValue({
      id: 'run_1',
      targetMonth: '2026-05',
      status: 'complete',
    } as never)

    const result = await findRunForBatch('batch_1')

    expect(db.post.findFirst).toHaveBeenCalledWith({
      where: { batchId: 'batch_1' },
      orderBy: { contentRun: { createdAt: 'desc' } },
      select: { contentRunId: true },
    })
    expect(db.contentRun.findUnique).toHaveBeenCalledWith({
      where: { id: 'run_1' },
      include: { posts: { orderBy: { postDate: 'asc' } } },
    })
    expect(result).not.toBeNull()
    expect(result?.id).toBe('run_1')
    expect(result?.targetMonth).toBe('2026-05')
  })

  it('returns null when batch has no posts', async () => {
    vi.mocked(db.post.findFirst).mockResolvedValue(null)

    const result = await findRunForBatch('batch_empty')

    expect(result).toBeNull()
    expect(db.contentRun.findUnique).not.toHaveBeenCalled()
  })
})
