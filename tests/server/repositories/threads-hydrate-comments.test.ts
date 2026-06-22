// @vitest-environment node
/**
 * Regression test for the pin-thread multi-comment bug: hydration must carry
 * EVERY fetched comment through to the hydrated thread, not just the first.
 * Previously toHydratedThread collapsed comments[] to firstComment +
 * commentCount, so replies 2..N vanished on router.refresh().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: { postThread: { findMany: vi.fn() } },
}))

import { db } from '@/db/client'
import { listThreadsForPost } from '@/server/repositories/threads'

beforeEach(() => vi.clearAllMocks())

describe('listThreadsForPost hydration carries all comments', () => {
  it('hydrates every comment on a thread in createdAt order', async () => {
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
            body: 'first comment',
            authorId: null,
            reviewerName: 'Sarah',
            author: null,
            createdAt: new Date('2026-05-15T10:00:00Z'),
          },
          {
            body: 'second comment',
            authorId: null,
            reviewerName: 'Sarah',
            author: null,
            createdAt: new Date('2026-05-15T10:05:00Z'),
          },
        ],
      },
    ] as never)

    const threads = await listThreadsForPost({ postId: 'postA', includeResolved: true })

    expect(threads).toHaveLength(1)
    const thread = threads[0]
    // firstComment + commentCount preserved
    expect(thread.firstComment.body).toBe('first comment')
    expect(thread.commentCount).toBe(2)
    // comments carries BOTH, in order
    expect(thread.comments).toHaveLength(2)
    expect(thread.comments.map((c) => c.body)).toEqual([
      'first comment',
      'second comment',
    ])
  })
})
