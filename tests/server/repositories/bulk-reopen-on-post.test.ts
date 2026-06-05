import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { postThread: { updateMany: vi.fn() } },
}))

import { db } from '@/db/client'
import { bulkReopenOnPost } from '@/server/repositories/threads'

describe('bulkReopenOnPost', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reopens resolved client pins matching the reason; returns the count', async () => {
    vi.mocked(db.postThread.updateMany).mockResolvedValue({ count: 2 } as never)
    const n = await bulkReopenOnPost({
      postId: 'p1',
      onlyClientPins: true,
      resolvedReason: 'Addressed from review session',
    })
    expect(n).toBe(2)
    const arg = vi.mocked(db.postThread.updateMany).mock.calls[0][0]
    expect(arg.where).toMatchObject({
      postId: 'p1',
      status: 'resolved',
      reviewerToken: { not: null },
      resolvedReason: 'Addressed from review session',
    })
    expect(arg.data).toMatchObject({
      status: 'open',
      resolvedAt: null,
      resolvedBy: null,
      resolvedReason: null,
    })
  })

  it('omits the client-pin and reason filters when not provided', async () => {
    vi.mocked(db.postThread.updateMany).mockResolvedValue({ count: 0 } as never)
    await bulkReopenOnPost({ postId: 'p1' })
    const arg = vi.mocked(db.postThread.updateMany).mock.calls[0][0]
    expect(arg.where).toMatchObject({ postId: 'p1', status: 'resolved' })
    expect('reviewerToken' in (arg.where ?? {})).toBe(false)
    expect('resolvedReason' in (arg.where ?? {})).toBe(false)
  })
})
