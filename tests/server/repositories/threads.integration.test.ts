// @vitest-environment node
/**
 * Integration tests for the post-thread repository.
 *
 * Mirrors the .env.local hoisted Prisma pattern from
 * tests/server/repositories/posts.integration.test.ts so the suite picks
 * up TEST_DATABASE_URL when run via `npx vitest run` directly. The
 * `tests/server/repositories/threads.test.ts` filename was specified by
 * the task spec; it does not match the *.integration.test.ts glob, so it
 * runs under `npm test` as well as the integration runner.
 *
 * 8 cases:
 *   1. createThread (AM, image pin)
 *   2. createThread (reviewer, caption-text pin)
 *   3. addComment to open thread
 *   4. addComment to resolved thread throws
 *   5. resolveThread sets fields + idempotent
 *   6. reopenThread clears fields
 *   7. listThreadsForPost returns FeedPostProps['threads'] shape
 *   8. bulkResolveOnPost flips all open + returns count
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'

const { db, pool } = await vi.hoisted(async () => {
  const path = await import('path')
  const dotenv = await import('dotenv')
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false })
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false })

  // Prefer TEST_DATABASE_URL when present so this file mirrors the
  // integration runner. Falls back to DATABASE_URL only if the operator
  // explicitly opted in (matches the existing posts.integration.test.ts
  // behavior, which also uses .env.local TEST_DATABASE_URL via the runner).
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      '[threads.test.ts] Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
        'Add TEST_DATABASE_URL to .env.local (see projects/relay-app/2026-05-15-neon-db-split-design.md).',
    )
  }
  process.env.DATABASE_URL = url

  const { Pool } = await import('pg')
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { applySoftDelete } = await import('@/db/soft-delete-extension')

  const pool = new Pool({ connectionString: url })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({ adapter, log: ['error'] })
  const db = applySoftDelete(base)
  return { db, pool }
})

vi.mock('@/db/client', () => ({ db }))

import {
  addComment,
  bulkResolveOnPost,
  createThread,
  listThreadsForPost,
  reopenThread,
  resolveThread,
  ThreadResolvedError,
} from '@/server/repositories/threads'
import type { ThreadActor } from '@/server/repositories/threads'

afterAll(async () => {
  await pool.end()
})

let orgId: string
let clientId: string
let userId: string
let postId: string

beforeEach(async () => {
  const uid = randomUUID()
  const org = await db.organization.create({
    data: {
      name: `test-threads-org-${uid}`,
      clerkOrgId: `test-threads-org-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: {
      organizationId: orgId,
      name: `test-threads-client-${uid}`,
      postingDays: 'Mon,Wed,Fri',
    },
  })
  clientId = client.id

  const user = await db.user.create({
    data: {
      clerkUserId: `test-threads-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `threads-user-${uid}@test.invalid`,
      name: `Threads User ${uid}`,
      avatarUrl: 'https://example.invalid/a.png',
    },
  })
  userId = user.id
  await db.membership.create({
    data: { userId, organizationId: orgId, role: 'admin' },
  })

  const run = await db.contentRun.create({
    data: {
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
      status: 'queued',
    },
  })
  const post = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId,
      postDate: new Date('2026-05-15'),
      caption: 'Welcome to our new patio space. Sundays are family day.',
      hashtags: ['#welcome'],
      mediaUrls: [],
    },
  })
  postId = post.id
})

afterEach(async () => {
  if (!orgId) return
  // Threads + comments cascade off Post, but order here is FK-safe regardless.
  const posts = await db.post
    .withArchived()
    .findMany({ where: { clientId }, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  if (postIds.length > 0) {
    await db.postComment.deleteMany({ where: { thread: { postId: { in: postIds } } } })
    await db.postThread.deleteMany({ where: { postId: { in: postIds } } })
  }
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  if (postIds.length > 0) {
    await db.post.withArchived().deleteMany({ where: { id: { in: postIds } } })
    await db.contentRun.deleteMany({ where: { clientId } })
  }
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

const amActor = (): ThreadActor => ({ kind: 'am', userId })
const reviewerActor = (): ThreadActor => ({
  kind: 'reviewer',
  reviewerToken: 'sha256_test_token_hash',
  reviewerName: 'Acme Reviewer',
})

describe('createThread', () => {
  it('creates an AM-authored thread with an image pin', async () => {
    const result = await createThread({
      postId,
      pin: { kind: 'image', x: 42.5, y: 17.25 },
      body: 'Move this logo a little to the right',
      author: amActor(),
    })

    expect(result.threadId).toBeTruthy()
    expect(result.postId).toBe(postId)
    expect(result.status).toBe('open')
    expect(result.pin).toEqual({ kind: 'image', x: 42.5, y: 17.25 })
    expect(result.firstComment.body).toBe('Move this logo a little to the right')
    expect(result.firstComment.author).toEqual({
      kind: 'am',
      userId,
      name: expect.stringMatching(/^Threads User /),
      avatarUrl: 'https://example.invalid/a.png',
    })

    // DB-level verification: the row carries the AM attribution.
    const row = await db.postThread.findUnique({ where: { id: result.threadId } })
    expect(row?.createdBy).toBe(userId)
    expect(row?.reviewerToken).toBeNull()
    expect(row?.imageX).toBeCloseTo(42.5)
    expect(row?.imageY).toBeCloseTo(17.25)
    expect(row?.captionFrom).toBeNull()
    expect(row?.captionTo).toBeNull()
  })

  it('creates a reviewer-authored thread with a caption-text pin', async () => {
    const result = await createThread({
      postId,
      pin: { kind: 'caption', from: 11, to: 24 },
      body: 'This phrase reads awkward',
      author: reviewerActor(),
    })

    expect(result.pin).toEqual({ kind: 'caption', from: 11, to: 24 })
    expect(result.firstComment.author).toEqual({
      kind: 'client',
      reviewerName: 'Acme Reviewer',
    })

    const row = await db.postThread.findUnique({ where: { id: result.threadId } })
    expect(row?.createdBy).toBeNull()
    expect(row?.reviewerToken).toBe('sha256_test_token_hash')
    expect(row?.captionFrom).toBe(11)
    expect(row?.captionTo).toBe(24)

    const comment = await db.postComment.findFirst({
      where: { threadId: result.threadId },
    })
    expect(comment?.authorId).toBeNull()
    expect(comment?.reviewerToken).toBe('sha256_test_token_hash')
    expect(comment?.reviewerName).toBe('Acme Reviewer')
  })
})

describe('addComment', () => {
  it('appends a comment to an open thread', async () => {
    const thread = await createThread({
      postId,
      pin: { kind: 'post' },
      body: 'first',
      author: amActor(),
    })

    const second = await addComment({
      threadId: thread.threadId,
      body: 'second',
      author: reviewerActor(),
    })

    expect(second.body).toBe('second')
    expect(second.threadId).toBe(thread.threadId)
    expect(second.author).toEqual({
      kind: 'client',
      reviewerName: 'Acme Reviewer',
    })

    const all = await db.postComment.findMany({
      where: { threadId: thread.threadId },
      orderBy: { createdAt: 'asc' },
    })
    expect(all).toHaveLength(2)
    expect(all[1].body).toBe('second')
  })

  it('throws ThreadResolvedError when adding a comment to a resolved thread', async () => {
    const thread = await createThread({
      postId,
      pin: { kind: 'post' },
      body: 'first',
      author: amActor(),
    })
    await resolveThread({
      threadId: thread.threadId,
      resolvedBy: userId,
      resolvedReason: 'addressed in revision',
    })

    await expect(
      addComment({
        threadId: thread.threadId,
        body: 'late comment',
        author: amActor(),
      }),
    ).rejects.toBeInstanceOf(ThreadResolvedError)
  })
})

describe('resolveThread', () => {
  it('sets the resolved fields and is idempotent', async () => {
    const thread = await createThread({
      postId,
      pin: { kind: 'post' },
      body: 'review please',
      author: reviewerActor(),
    })

    await resolveThread({
      threadId: thread.threadId,
      resolvedBy: userId,
      resolvedReason: 'addressed',
    })

    const row1 = await db.postThread.findUnique({ where: { id: thread.threadId } })
    expect(row1?.status).toBe('resolved')
    expect(row1?.resolvedBy).toBe(userId)
    expect(row1?.resolvedReason).toBe('addressed')
    expect(row1?.resolvedAt).toBeInstanceOf(Date)
    const firstResolvedAt = row1!.resolvedAt!

    // Re-resolve: must be a no-op (does not overwrite the original
    // resolvedBy / resolvedReason / resolvedAt).
    await resolveThread({
      threadId: thread.threadId,
      resolvedBy: userId,
      resolvedReason: 'different reason',
    })
    const row2 = await db.postThread.findUnique({ where: { id: thread.threadId } })
    expect(row2?.status).toBe('resolved')
    expect(row2?.resolvedReason).toBe('addressed')
    expect(row2?.resolvedAt?.getTime()).toBe(firstResolvedAt.getTime())
  })
})

describe('reopenThread', () => {
  it('clears the resolved fields', async () => {
    const thread = await createThread({
      postId,
      pin: { kind: 'post' },
      body: 'one more thing',
      author: amActor(),
    })
    await resolveThread({
      threadId: thread.threadId,
      resolvedBy: userId,
      resolvedReason: 'done',
    })

    await reopenThread({ threadId: thread.threadId })

    const row = await db.postThread.findUnique({ where: { id: thread.threadId } })
    expect(row?.status).toBe('open')
    expect(row?.resolvedAt).toBeNull()
    expect(row?.resolvedBy).toBeNull()
    expect(row?.resolvedReason).toBeNull()
  })
})

describe('listThreadsForPost', () => {
  it('returns the FeedPostProps[threads] hydrated shape', async () => {
    const t1 = await createThread({
      postId,
      pin: { kind: 'image', x: 10, y: 90 },
      body: 'AM image pin',
      author: amActor(),
    })
    await addComment({
      threadId: t1.threadId,
      body: 'reply',
      author: amActor(),
    })

    await createThread({
      postId,
      pin: { kind: 'caption', from: 0, to: 7 },
      body: 'Reviewer caption pin',
      author: reviewerActor(),
    })

    const list = await listThreadsForPost({ postId })

    expect(list).toHaveLength(2)
    // Ordered by createdAt asc.
    const [first, second] = list
    expect(first.id).toBe(t1.threadId)
    expect(first.status).toBe('open')
    expect(first.pin).toEqual({ kind: 'image', x: 10, y: 90 })
    expect(first.commentCount).toBe(2)
    expect(first.firstComment.body).toBe('AM image pin')
    expect(first.firstComment.author).toMatchObject({
      kind: 'am',
      userId,
    })

    expect(second.pin).toEqual({ kind: 'caption', from: 0, to: 7 })
    expect(second.firstComment.author).toEqual({
      kind: 'client',
      reviewerName: 'Acme Reviewer',
    })
    expect(second.commentCount).toBe(1)

    // includeResolved defaults to false: a resolved thread is hidden.
    await resolveThread({
      threadId: t1.threadId,
      resolvedBy: userId,
      resolvedReason: 'fixed',
    })
    const afterResolve = await listThreadsForPost({ postId })
    expect(afterResolve).toHaveLength(1)
    expect(afterResolve[0].id).not.toBe(t1.threadId)

    const withResolved = await listThreadsForPost({ postId, includeResolved: true })
    expect(withResolved).toHaveLength(2)
  })
})

describe('bulkResolveOnPost', () => {
  it('flips every open thread and returns the count', async () => {
    await createThread({
      postId,
      pin: { kind: 'post' },
      body: 'a',
      author: amActor(),
    })
    await createThread({
      postId,
      pin: { kind: 'image', x: 1, y: 2 },
      body: 'b',
      author: reviewerActor(),
    })
    const c = await createThread({
      postId,
      pin: { kind: 'caption', from: 0, to: 5 },
      body: 'c',
      author: amActor(),
    })
    // Pre-resolve one so the bulk call only flips the remaining 2.
    await resolveThread({
      threadId: c.threadId,
      resolvedBy: userId,
      resolvedReason: 'pre-resolved',
    })

    const count = await bulkResolveOnPost({
      postId,
      resolvedBy: userId,
      resolvedReason: 'force-advanced',
    })

    expect(count).toBe(2)

    const remainingOpen = await db.postThread.count({
      where: { postId, status: 'open' },
    })
    expect(remainingOpen).toBe(0)

    const flipped = await db.postThread.findMany({
      where: { postId, resolvedReason: 'force-advanced' },
    })
    expect(flipped).toHaveLength(2)
    for (const row of flipped) {
      expect(row.resolvedBy).toBe(userId)
      expect(row.resolvedAt).toBeInstanceOf(Date)
    }

    // The pre-resolved thread keeps its original reason.
    const preResolved = await db.postThread.findUnique({ where: { id: c.threadId } })
    expect(preResolved?.resolvedReason).toBe('pre-resolved')
  })
})
