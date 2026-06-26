// @vitest-environment node
/**
 * Unit tests for the thread repository's auto-notify behavior.
 *
 * Focuses narrowly on the designer-mention emit path that ships with the
 * notification bell (Phase 1, Task 14). The full thread CRUD surface is
 * covered by tests/server/repositories/threads.integration.test.ts against
 * a real DB. Here we mock `db` and `recordActivity` so the mention payload
 * is asserted in isolation — no DB cluster needed.
 *
 * Two cases:
 *   1. createThread mentions the assigned designer when actor !== designer.
 *   2. createThread skips the mention when the AM actor IS the designer.
 *
 * Both cases assume an AM actor (reviewer actors never trigger the gate
 * because their userId is null).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    $transaction: vi.fn(),
    post: { findUnique: vi.fn() },
    postThread: { create: vi.fn(), findUnique: vi.fn() },
    postComment: { create: vi.fn() },
  },
}))

vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>(
    '@prisma/client',
  )
  return {
    recordActivity: vi.fn(),
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})

import { db } from '@/db/client'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { createThread } from '@/server/repositories/threads'
import type { ThreadActor } from '@/server/repositories/threads'

const POST_ID = 'cuid_post_1'
const CLIENT_ID = 'cuid_client_1'
const THREAD_ID = 'cuid_thread_1'
const COMMENT_ID = 'cuid_comment_1'

const AM_USER_ID = 'user_am_1'
const DESIGNER_USER_ID = 'user_designer_1'

beforeEach(() => {
  vi.clearAllMocks()

  // $transaction(fn) runs the callback with a tx that, for our purposes, is
  // just the same db mock. The repo only calls tx.postThread.create + tx.postComment.create.
  vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) => {
    if (typeof fn === 'function') {
      // The repo passes (tx) => ...; pass our db mock back as tx.
      return (fn as (tx: unknown) => Promise<unknown>)(db)
    }
    return fn
  })

  vi.mocked(db.postThread.create).mockResolvedValue({
    id: THREAD_ID,
    postId: POST_ID,
    status: 'open',
    imageX: 10,
    imageY: 20,
    captionFrom: null,
    captionTo: null,
    createdBy: AM_USER_ID,
    reviewerToken: null,
  } as never)

  vi.mocked(db.postComment.create).mockResolvedValue({
    id: COMMENT_ID,
    threadId: THREAD_ID,
    body: 'Move this',
    authorId: AM_USER_ID,
    reviewerToken: null,
    reviewerName: null,
    createdAt: new Date('2026-05-21T12:00:00Z'),
    author: {
      id: AM_USER_ID,
      name: 'AM User',
      avatarUrl: null,
    },
  } as never)
})

const amActor = (userId: string = AM_USER_ID): ThreadActor => ({
  kind: 'am',
  userId,
})

describe('createThread mention emit', () => {
  it('mentions the assigned designer when the AM actor is not the designer', async () => {
    // Post lookup after the tx returns clientId + the client's assigned designer.
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { assignedDesignerId: DESIGNER_USER_ID },
    } as never)

    await createThread({
      postId: POST_ID,
      pin: { kind: 'image', x: 10, y: 20 },
      body: 'Move this',
      author: amActor(AM_USER_ID),
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.kind).toBe(ActivityKind.post_thread_opened)
    expect(activityInput.clientId).toBe(CLIENT_ID)
    expect(activityInput.actorId).toBe(AM_USER_ID)
    expect(activityInput.mentionedUserIds).toEqual([DESIGNER_USER_ID])
  })

  it('does NOT mention the designer when the AM actor IS the designer', async () => {
    // Self-thread: AM user IS the assigned designer for this client.
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { assignedDesignerId: AM_USER_ID },
    } as never)

    await createThread({
      postId: POST_ID,
      pin: { kind: 'image', x: 10, y: 20 },
      body: 'Move this',
      author: amActor(AM_USER_ID),
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.kind).toBe(ActivityKind.post_thread_opened)
    // Either undefined or an empty array is acceptable — both signal "no mentions".
    const mentions = activityInput.mentionedUserIds ?? []
    expect(mentions).toEqual([])
  })

  it('does NOT mention anyone when the client has no assigned designer', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { assignedDesignerId: null },
    } as never)

    await createThread({
      postId: POST_ID,
      pin: { kind: 'image', x: 10, y: 20 },
      body: 'Move this',
      author: amActor(AM_USER_ID),
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    const mentions = activityInput.mentionedUserIds ?? []
    expect(mentions).toEqual([])
  })

  it('mentions the designer AND @mentioned users, tags surface internal_review, excludes actor', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { assignedDesignerId: DESIGNER_USER_ID },
    } as never)

    await createThread({
      postId: POST_ID,
      pin: { kind: 'image', x: 10, y: 20 },
      body: 'Move this @amy.admin',
      author: amActor(AM_USER_ID),
      mentionedUserIds: ['user_admin_1', AM_USER_ID],
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.kind).toBe(ActivityKind.post_thread_opened)
    const mentions = (activityInput.mentionedUserIds ?? []).slice().sort()
    // designer + admin mention; actor (AM_USER_ID) dropped even though passed.
    expect(mentions).toEqual(['user_admin_1', DESIGNER_USER_ID].sort())
    expect(mentions).not.toContain(AM_USER_ID)
    expect((activityInput.payload as Record<string, unknown>).surface).toBe('internal_review')
  })

  it('does NOT tag surface for a reviewer-created pin (client /review path stays untouched)', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({
      clientId: CLIENT_ID,
      client: { assignedDesignerId: DESIGNER_USER_ID },
    } as never)

    await createThread({
      postId: POST_ID,
      pin: { kind: 'image', x: 10, y: 20 },
      body: 'Please fix this',
      author: { kind: 'reviewer', reviewerToken: 'rt1', reviewerName: 'Dana Client' },
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    // Designer is still notified (kept behavior)...
    expect(activityInput.mentionedUserIds).toContain(DESIGNER_USER_ID)
    // ...but the event is NOT stamped internal_review, so the designer's deep
    // link keeps its prior (non-/preview) routing for client-originated pins.
    expect((activityInput.payload as Record<string, unknown>).surface).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Image-field persistence tests
// ---------------------------------------------------------------------------

import { addComment } from '@/server/repositories/threads'

describe('createThread image field persistence', () => {
  it('puts imageUrl + dims in postComment.create data and returns them on firstComment', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(null) // skip activity

    vi.mocked(db.postComment.create).mockResolvedValue({
      id: COMMENT_ID,
      threadId: THREAD_ID,
      body: 'Look at this',
      authorId: AM_USER_ID,
      reviewerToken: null,
      reviewerName: null,
      createdAt: new Date('2026-06-22T10:00:00Z'),
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/img.png',
      imageWidth: 800,
      imageHeight: 600,
      author: { id: AM_USER_ID, name: 'AM User', avatarUrl: null },
    } as never)

    const result = await createThread({
      postId: POST_ID,
      pin: { kind: 'post' },
      body: 'Look at this',
      author: amActor(),
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/img.png',
      imageWidth: 800,
      imageHeight: 600,
    })

    // The data passed to postComment.create must include the image fields
    const createCall = vi.mocked(db.postComment.create).mock.calls[0][0]
    expect(createCall.data).toMatchObject({
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/img.png',
      imageWidth: 800,
      imageHeight: 600,
    })

    // The result's firstComment must carry the fields back
    expect(result.firstComment).toMatchObject({
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/img.png',
      imageWidth: 800,
      imageHeight: 600,
    })
  })

  it('persists null when no image fields are provided', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(null)

    vi.mocked(db.postComment.create).mockResolvedValue({
      id: COMMENT_ID,
      threadId: THREAD_ID,
      body: 'Plain text',
      authorId: AM_USER_ID,
      reviewerToken: null,
      reviewerName: null,
      createdAt: new Date('2026-06-22T10:00:00Z'),
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
      author: { id: AM_USER_ID, name: 'AM User', avatarUrl: null },
    } as never)

    const result = await createThread({
      postId: POST_ID,
      pin: { kind: 'post' },
      body: 'Plain text',
      author: amActor(),
    })

    const createCall = vi.mocked(db.postComment.create).mock.calls[0][0]
    expect(createCall.data).toMatchObject({
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })

    expect(result.firstComment).toMatchObject({
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })
  })
})

describe('addComment image field persistence', () => {
  beforeEach(() => {
    // addComment's tx calls postThread.findUnique to guard against resolved threads.
    // The top-level beforeEach wires $transaction to pass `db` back as `tx`,
    // so mocking db.postThread.findUnique covers both paths.
    vi.mocked(db.postThread.findUnique).mockResolvedValue({
      id: THREAD_ID,
      status: 'open',
    } as never)
  })

  it('puts imageUrl + dims in postComment.create data and returns them', async () => {
    vi.mocked(db.postComment.create).mockResolvedValue({
      id: COMMENT_ID,
      threadId: THREAD_ID,
      body: 'See image',
      authorId: AM_USER_ID,
      reviewerToken: null,
      reviewerName: null,
      createdAt: new Date('2026-06-22T11:00:00Z'),
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/reply.png',
      imageWidth: 1920,
      imageHeight: 1080,
      author: { id: AM_USER_ID, name: 'AM User', avatarUrl: null },
    } as never)

    const result = await addComment({
      threadId: THREAD_ID,
      body: 'See image',
      author: amActor(),
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/reply.png',
      imageWidth: 1920,
      imageHeight: 1080,
    })

    const createCall = vi.mocked(db.postComment.create).mock.calls[0][0]
    expect(createCall.data).toMatchObject({
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/reply.png',
      imageWidth: 1920,
      imageHeight: 1080,
    })

    expect(result).toMatchObject({
      imageUrl: 'https://abc.vercel-storage.test/comment-images/am/user1/reply.png',
      imageWidth: 1920,
      imageHeight: 1080,
    })
  })

  it('persists null when no image provided', async () => {
    vi.mocked(db.postComment.create).mockResolvedValue({
      id: COMMENT_ID,
      threadId: THREAD_ID,
      body: 'Just text',
      authorId: AM_USER_ID,
      reviewerToken: null,
      reviewerName: null,
      createdAt: new Date('2026-06-22T11:01:00Z'),
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
      author: { id: AM_USER_ID, name: 'AM User', avatarUrl: null },
    } as never)

    const result = await addComment({
      threadId: THREAD_ID,
      body: 'Just text',
      author: amActor(),
    })

    const createCall = vi.mocked(db.postComment.create).mock.calls[0][0]
    expect(createCall.data).toMatchObject({
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })

    expect(result).toMatchObject({
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    })
  })
})
