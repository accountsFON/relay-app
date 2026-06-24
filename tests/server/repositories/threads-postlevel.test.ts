import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { postThread: { findFirst: vi.fn() } },
}))
import { db } from '@/db/client'
import { findOpenPostLevelReviewerThread } from '@/server/repositories/threads'

describe('findOpenPostLevelReviewerThread', () => {
  beforeEach(() => vi.clearAllMocks())

  it('queries open, null-coord, reviewer-token-matched threads and returns the id', async () => {
    vi.mocked(db.postThread.findFirst).mockResolvedValue({ id: 'thread_1' } as never)
    const id = await findOpenPostLevelReviewerThread({ postId: 'p1', reviewerToken: 'tok' })
    expect(id).toBe('thread_1')
    expect(db.postThread.findFirst).toHaveBeenCalledWith({
      where: {
        postId: 'p1',
        reviewerToken: 'tok',
        status: 'open',
        imageX: null, imageY: null, captionFrom: null, captionTo: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
  })

  it('returns null when none exists', async () => {
    vi.mocked(db.postThread.findFirst).mockResolvedValue(null as never)
    expect(await findOpenPostLevelReviewerThread({ postId: 'p1', reviewerToken: 'tok' })).toBeNull()
  })
})
