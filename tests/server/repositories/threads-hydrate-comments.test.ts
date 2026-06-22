// @vitest-environment node
/**
 * Regression test for the pin-thread multi-comment bug: hydration must carry
 * EVERY fetched comment through to the hydrated thread, not just the first.
 * Previously toHydratedThread collapsed comments[] to firstComment +
 * commentCount, so replies 2..N vanished on router.refresh().
 *
 * Also covers Task 7: imageUrl/imageWidth/imageHeight must be threaded from
 * the Prisma row through toHydratedThread onto firstComment and each comment.
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
            imageUrl: null,
            imageWidth: null,
            imageHeight: null,
          },
          {
            body: 'second comment',
            authorId: null,
            reviewerName: 'Sarah',
            author: null,
            createdAt: new Date('2026-05-15T10:05:00Z'),
            imageUrl: null,
            imageWidth: null,
            imageHeight: null,
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

describe('listThreadsForPost hydration carries imageUrl/imageWidth/imageHeight', () => {
  it('threads image fields from a comment row onto firstComment and comments', async () => {
    vi.mocked(db.postThread.findMany).mockResolvedValue([
      {
        id: 't2',
        postId: 'postB',
        status: 'open',
        imageX: null,
        imageY: null,
        captionFrom: null,
        captionTo: null,
        createdAt: new Date('2026-06-22T09:00:00Z'),
        comments: [
          {
            body: 'look at this screenshot',
            authorId: null,
            reviewerName: 'Alice',
            author: null,
            createdAt: new Date('2026-06-22T09:00:00Z'),
            imageUrl: 'https://cdn.example.com/comment-images/img1.png',
            imageWidth: 1280,
            imageHeight: 720,
          },
          {
            body: 'another reply with image',
            authorId: null,
            reviewerName: 'Alice',
            author: null,
            createdAt: new Date('2026-06-22T09:05:00Z'),
            imageUrl: 'https://cdn.example.com/comment-images/img2.png',
            imageWidth: 640,
            imageHeight: 480,
          },
        ],
      },
    ] as never)

    const threads = await listThreadsForPost({ postId: 'postB', includeResolved: true })

    expect(threads).toHaveLength(1)
    const thread = threads[0]

    // firstComment must carry the image fields from the first comment row
    expect(thread.firstComment.imageUrl).toBe('https://cdn.example.com/comment-images/img1.png')
    expect(thread.firstComment.imageWidth).toBe(1280)
    expect(thread.firstComment.imageHeight).toBe(720)

    // comments[0] must carry them too
    expect(thread.comments[0].imageUrl).toBe('https://cdn.example.com/comment-images/img1.png')
    expect(thread.comments[0].imageWidth).toBe(1280)
    expect(thread.comments[0].imageHeight).toBe(720)

    // comments[1] gets its own image fields
    expect(thread.comments[1].imageUrl).toBe('https://cdn.example.com/comment-images/img2.png')
    expect(thread.comments[1].imageWidth).toBe(640)
    expect(thread.comments[1].imageHeight).toBe(480)
  })

  it('hydrates null image fields when the comment row has no attachment', async () => {
    vi.mocked(db.postThread.findMany).mockResolvedValue([
      {
        id: 't3',
        postId: 'postC',
        status: 'open',
        imageX: null,
        imageY: null,
        captionFrom: null,
        captionTo: null,
        createdAt: new Date('2026-06-22T10:00:00Z'),
        comments: [
          {
            body: 'plain text, no image',
            authorId: null,
            reviewerName: 'Bob',
            author: null,
            createdAt: new Date('2026-06-22T10:00:00Z'),
            imageUrl: null,
            imageWidth: null,
            imageHeight: null,
          },
        ],
      },
    ] as never)

    const threads = await listThreadsForPost({ postId: 'postC', includeResolved: true })

    expect(threads).toHaveLength(1)
    const thread = threads[0]

    expect(thread.firstComment.imageUrl).toBeNull()
    expect(thread.firstComment.imageWidth).toBeNull()
    expect(thread.firstComment.imageHeight).toBeNull()

    expect(thread.comments[0].imageUrl).toBeNull()
    expect(thread.comments[0].imageWidth).toBeNull()
    expect(thread.comments[0].imageHeight).toBeNull()
  })
})
