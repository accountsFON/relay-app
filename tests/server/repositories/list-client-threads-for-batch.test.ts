// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { postThread: { findMany: vi.fn(), updateMany: vi.fn() } },
}))

import { db } from '@/db/client'
import {
  listClientThreadsForBatch,
  bulkResolveOnPost,
} from '@/server/repositories/threads'

beforeEach(() => vi.clearAllMocks())

describe('listClientThreadsForBatch', () => {
  it('filters to client pins (reviewerToken not null) and groups by postId', async () => {
    vi.mocked(db.postThread.findMany).mockResolvedValue([
      {
        id: 't1',
        postId: 'postA',
        status: 'open',
        imageX: 10,
        imageY: 20,
        captionFrom: null,
        captionTo: null,
        createdAt: new Date('2026-05-15T10:00:00Z'),
        comments: [
          {
            body: 'fix the logo',
            authorId: null,
            reviewerName: 'Sarah',
            author: null,
            createdAt: new Date('2026-05-15T10:00:00Z'),
          },
        ],
      },
      {
        id: 't2',
        postId: 'postB',
        status: 'resolved',
        imageX: null,
        imageY: null,
        captionFrom: null,
        captionTo: null,
        createdAt: new Date('2026-05-15T11:00:00Z'),
        comments: [
          {
            body: 'looks good',
            authorId: null,
            reviewerName: 'Sarah',
            author: null,
            createdAt: new Date('2026-05-15T11:00:00Z'),
          },
        ],
      },
    ] as never)

    const map = await listClientThreadsForBatch({
      batchId: 'batch1',
      includeResolved: true,
    })

    const where = vi.mocked(db.postThread.findMany).mock.calls[0][0]!.where
    expect(where).toMatchObject({
      post: { batchId: 'batch1' },
      reviewerToken: { not: null },
    })
    expect(where).not.toHaveProperty('status') // includeResolved omits the status filter

    expect(map.get('postA')?.[0]).toMatchObject({
      id: 't1',
      status: 'open',
      pin: { kind: 'image', x: 10, y: 20 },
      commentCount: 1,
    })
    expect(map.get('postA')?.[0].firstComment.body).toBe('fix the logo')
    expect(map.get('postB')?.[0]).toMatchObject({ id: 't2', status: 'resolved' })
  })

  it('adds status:open to the where when includeResolved is false', async () => {
    vi.mocked(db.postThread.findMany).mockResolvedValue([] as never)
    await listClientThreadsForBatch({ batchId: 'batch1' })
    const where = vi.mocked(db.postThread.findMany).mock.calls[0][0]!.where
    expect(where).toMatchObject({ status: 'open' })
  })
})

describe('bulkResolveOnPost onlyClientPins', () => {
  it('adds reviewerToken filter when onlyClientPins is true', async () => {
    vi.mocked(db.postThread.updateMany).mockResolvedValue({ count: 2 } as never)
    const count = await bulkResolveOnPost({
      postId: 'postA',
      resolvedBy: 'am1',
      resolvedReason: 'done',
      onlyClientPins: true,
    })
    expect(count).toBe(2)
    const where = vi.mocked(db.postThread.updateMany).mock.calls[0][0]!.where
    expect(where).toMatchObject({
      postId: 'postA',
      status: 'open',
      reviewerToken: { not: null },
    })
  })

  it('omits reviewerToken filter by default', async () => {
    vi.mocked(db.postThread.updateMany).mockResolvedValue({ count: 0 } as never)
    await bulkResolveOnPost({ postId: 'postA', resolvedBy: 'am1', resolvedReason: 'done' })
    const where = vi.mocked(db.postThread.updateMany).mock.calls[0][0]!.where
    expect(where).not.toHaveProperty('reviewerToken')
  })
})
