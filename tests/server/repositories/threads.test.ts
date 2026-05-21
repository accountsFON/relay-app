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
    postThread: { create: vi.fn() },
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
})
