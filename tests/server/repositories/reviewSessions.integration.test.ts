// @vitest-environment node
/**
 * Integration tests for the ReviewSession repository (v2 client review flow).
 *
 * Mirrors the hoisted-Prisma setup from
 * `tests/server/repositories/threads.integration.test.ts` so the suite picks
 * up TEST_DATABASE_URL when run directly via `npx vitest run`.
 *
 * 8 cases:
 *   1. startSession creates an in_progress, round=1 row
 *   2. findActiveSession returns the latest in_progress
 *   3. findActiveSession returns null when only submitted/superseded exist
 *   4. saveDraftItem upserts (insert then update for same postId)
 *   5. submitSession flips status, sets submittedAt + summary
 *   6. markSuperseded flips status
 *   7. listSessionsForBatch orders by submittedAt desc (in_progress last)
 *   8. findSessionWithItems hydrates items in ReviewItemHydrated shape
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'

const { db, pool } = await vi.hoisted(async () => {
  const path = await import('path')
  const dotenv = await import('dotenv')
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false })
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false })

  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      '[reviewSessions.integration.test.ts] Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
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
  findActiveSession,
  findSessionWithItems,
  findStaleInProgressSessions,
  listSessionsForBatch,
  markSuperseded,
  saveDraftItem,
  startSession,
  submitSession,
} from '@/server/repositories/reviewSessions'

afterAll(async () => {
  await pool.end()
})

let orgId: string
let clientId: string
let userId: string
let batchId: string
let magicLinkId: string
let reviewerId: string
let otherReviewerId: string
let postIds: string[]

beforeEach(async () => {
  const uid = randomUUID()

  const org = await db.organization.create({
    data: {
      name: `rs-org-${uid}`,
      clerkOrgId: `rs-org-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: {
      organizationId: orgId,
      name: `rs-client-${uid}`,
      postingDays: 'Mon,Wed,Fri',
    },
  })
  clientId = client.id

  const user = await db.user.create({
    data: {
      clerkUserId: `rs-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `rs-user-${uid}@test.invalid`,
      name: `RS User ${uid}`,
    },
  })
  userId = user.id
  await db.membership.create({
    data: { userId, organizationId: orgId, role: 'admin' },
  })

  const batch = await db.batch.create({
    data: {
      clientId,
      label: `rs-batch-${uid}`,
      currentStep: 'copy',
      currentHolder: userId,
      currentRole: 'am',
    },
  })
  batchId = batch.id

  const run = await db.contentRun.create({
    data: {
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
      status: 'queued',
    },
  })

  // Create 3 posts on the batch (enough to vary decisions in summary tests).
  const posts = await Promise.all(
    [0, 1, 2].map((i) =>
      db.post.create({
        data: {
          contentRunId: run.id,
          clientId,
          batchId: batch.id,
          postDate: new Date(`2026-05-${15 + i}`),
          caption: `Post ${i}`,
          hashtags: [],
          mediaUrls: [],
        },
      }),
    ),
  )
  postIds = posts.map((p) => p.id)

  const link = await db.magicLink.create({
    data: {
      batchId,
      tokenHash: `hash-${uid}`,
      defaultReviewerName: 'Reviewer',
      defaultReviewerEmail: `reviewer-${uid}@test.invalid`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdBy: userId,
    },
  })
  magicLinkId = link.id

  const reviewer = await db.magicLinkReviewer.create({
    data: {
      magicLinkId,
      name: 'Sarah Smith',
      sessionId: `sess-${uid}`,
    },
  })
  reviewerId = reviewer.id

  const otherReviewer = await db.magicLinkReviewer.create({
    data: {
      magicLinkId,
      name: 'Other Reviewer',
      sessionId: `sess-other-${uid}`,
    },
  })
  otherReviewerId = otherReviewer.id
})

afterEach(async () => {
  if (!orgId) return
  // Review sessions + items cascade off MagicLink + Post.
  await db.reviewItem.deleteMany({ where: { reviewSession: { magicLinkId } } })
  await db.reviewSession.deleteMany({ where: { magicLinkId } })
  await db.magicLinkReviewer.deleteMany({ where: { magicLinkId } })
  await db.magicLink.deleteMany({ where: { batchId } })

  const posts = await db.post
    .withArchived()
    .findMany({ where: { clientId }, select: { id: true } })
  const pids = posts.map((p) => p.id)
  if (pids.length > 0) {
    await db.post.withArchived().deleteMany({ where: { id: { in: pids } } })
  }
  await db.contentRun.deleteMany({ where: { clientId } })
  await db.batch.deleteMany({ where: { clientId } })
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

// ---- Tests ----

describe('startSession', () => {
  it('creates an in_progress row at round 1 by default', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    expect(session.id).toBeTruthy()
    expect(session.magicLinkId).toBe(magicLinkId)
    expect(session.reviewerId).toBe(reviewerId)
    expect(session.status).toBe('in_progress')
    expect(session.round).toBe(1)
    expect(session.submittedAt).toBeNull()
    expect(session.submittedSummary).toBeNull()
  })
})

describe('findActiveSession', () => {
  it('returns the latest in_progress session when multiple exist', async () => {
    const first = await startSession({ magicLinkId, reviewerId })
    // Force a discernible startedAt gap by waiting a tick.
    await new Promise((r) => setTimeout(r, 5))
    const second = await startSession({ magicLinkId, reviewerId, round: 2 })

    const active = await findActiveSession({ magicLinkId, reviewerId })
    expect(active?.id).toBe(second.id)
    expect(active?.round).toBe(2)
    // Sanity: the older session is still around and still in_progress.
    const firstRow = await db.reviewSession.findUnique({ where: { id: first.id } })
    expect(firstRow?.status).toBe('in_progress')
  })

  it('returns null when only submitted/superseded sessions exist', async () => {
    const submitted = await startSession({ magicLinkId, reviewerId })
    await submitSession({ reviewSessionId: submitted.id })

    const superseded = await startSession({ magicLinkId, reviewerId, round: 2 })
    await markSuperseded({ reviewSessionId: superseded.id, by: userId })

    const active = await findActiveSession({ magicLinkId, reviewerId })
    expect(active).toBeNull()
  })
})

describe('saveDraftItem', () => {
  it('inserts on first call and updates in place on second', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    const first = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'approved',
    })
    expect(first.decision).toBe('approved')
    expect(first.comment).toBeNull()

    const second = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'changes_requested',
      comment: 'On second thought...',
    })
    expect(second.id).toBe(first.id)
    expect(second.decision).toBe('changes_requested')
    expect(second.comment).toBe('On second thought...')

    // Sanity: only one row exists for this (session, post).
    const all = await db.reviewItem.findMany({
      where: { reviewSessionId: session.id, postId: postIds[0] },
    })
    expect(all).toHaveLength(1)
  })

  // Regression: PATCH /api/review/[token]/draft sends only the fields the
  // reviewer changed. Undefined fields must mean "leave alone" all the way
  // down to Prisma. Without this, typing a comment after tapping a decision
  // (or vice versa) silently clobbers the other field.
  // See projects/relay-app/2026-05-17-julio-handoff.md known bug #1.
  it('preserves prior decision when a follow-up call only sends a comment', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'changes_requested',
    })

    const after = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      comment: 'needs more emojis',
    })

    expect(after.decision).toBe('changes_requested')
    expect(after.comment).toBe('needs more emojis')
  })

  it('preserves prior comment when a follow-up call only sends a decision', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'not_reviewed',
      comment: 'thinking about it',
    })

    const after = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'changes_requested',
    })

    expect(after.decision).toBe('changes_requested')
    expect(after.comment).toBe('thinking about it')
  })

  it('preserves prior suggestedCaption when a follow-up call only sends a comment', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'caption_edited',
      suggestedCaption: 'Welcome to our outdoor seating area',
    })

    const after = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      comment: 'softer tone please',
    })

    expect(after.decision).toBe('caption_edited')
    expect(after.suggestedCaption).toBe('Welcome to our outdoor seating area')
    expect(after.comment).toBe('softer tone please')
  })

  it('clears comment when null is explicitly sent', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'changes_requested',
      comment: 'first thoughts',
    })

    const after = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      comment: null,
    })

    expect(after.decision).toBe('changes_requested')
    expect(after.comment).toBeNull()
  })

  it('clears suggestedCaption when null is explicitly sent', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'caption_edited',
      suggestedCaption: 'a first try',
    })

    const after = await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      suggestedCaption: null,
    })

    expect(after.decision).toBe('caption_edited')
    expect(after.suggestedCaption).toBeNull()
  })
})

describe('submitSession', () => {
  it('flips status, sets submittedAt, and persists computed summary', async () => {
    const session = await startSession({ magicLinkId, reviewerId })
    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'approved',
    })
    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[1],
      decision: 'changes_requested',
      comment: 'Fix the headline',
    })
    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[2],
      decision: 'caption_edited',
      suggestedCaption: 'Welcome to our outdoor seating area',
    })

    const submitted = await submitSession({ reviewSessionId: session.id })
    expect(submitted.status).toBe('submitted')
    expect(submitted.submittedAt).toBeInstanceOf(Date)
    expect(submitted.submittedSummary).toEqual({
      approved: 1,
      changesRequested: 1,
      captionEdited: 1,
      totalPosts: 3,
    })
  })

})

describe('markSuperseded', () => {
  it('flips an in_progress session to superseded', async () => {
    const session = await startSession({ magicLinkId, reviewerId })
    await markSuperseded({ reviewSessionId: session.id, by: userId })

    const row = await db.reviewSession.findUnique({ where: { id: session.id } })
    expect(row?.status).toBe('superseded')
  })
})

describe('listSessionsForBatch', () => {
  it('returns sessions ordered by submittedAt desc with in_progress last', async () => {
    // Submitted earliest
    const olderSubmitted = await startSession({ magicLinkId, reviewerId })
    await submitSession({ reviewSessionId: olderSubmitted.id })

    await new Promise((r) => setTimeout(r, 5))

    // Submitted most recently
    const newerSubmitted = await startSession({
      magicLinkId,
      reviewerId: otherReviewerId,
    })
    await submitSession({ reviewSessionId: newerSubmitted.id })

    // Active draft, submittedAt is null
    const inProgress = await startSession({
      magicLinkId,
      reviewerId,
      round: 2,
    })

    const list = await listSessionsForBatch(batchId)
    const ids = list.map((s) => s.id)

    expect(ids).toHaveLength(3)
    // Submitted rows come first, most recent submission at the top.
    expect(ids[0]).toBe(newerSubmitted.id)
    expect(ids[1]).toBe(olderSubmitted.id)
    // In-progress session (submittedAt null) sorts last.
    expect(ids[2]).toBe(inProgress.id)

    // Hydrated shape carries reviewer + items.
    expect(list[0].reviewer?.id).toBe(otherReviewerId)
    expect(Array.isArray(list[0].items)).toBe(true)
  })
})

describe('internal sessions (kind=internal)', () => {
  it('startSession creates an internal session with reviewerUserId, batchId, magicLinkId null', async () => {
    const session = await startSession({
      kind: 'internal',
      reviewerUserId: userId,
      batchId,
    })

    expect(session.id).toBeTruthy()
    expect(session.kind).toBe('internal')
    expect(session.batchId).toBe(batchId)
    expect(session.reviewerUserId).toBe(userId)
    expect(session.magicLinkId).toBeNull()
    expect(session.reviewerId).toBeNull()
    expect(session.status).toBe('in_progress')
    expect(session.round).toBe(1)
  })

  it('a client session created the old way still has kind=client + batchId populated', async () => {
    const session = await startSession({ magicLinkId, reviewerId })

    expect(session.kind).toBe('client')
    expect(session.batchId).toBe(batchId)
    expect(session.magicLinkId).toBe(magicLinkId)
    expect(session.reviewerUserId).toBeNull()
  })

  it('findActiveSession resolves an internal session keyed on (batchId, reviewerUserId)', async () => {
    const created = await startSession({
      kind: 'internal',
      reviewerUserId: userId,
      batchId,
    })

    const active = await findActiveSession({
      kind: 'internal',
      batchId,
      reviewerUserId: userId,
    })
    expect(active?.id).toBe(created.id)

    // A submitted internal session is no longer active.
    await submitSession({ reviewSessionId: created.id })
    const afterSubmit = await findActiveSession({
      kind: 'internal',
      batchId,
      reviewerUserId: userId,
    })
    expect(afterSubmit).toBeNull()
  })

  it('listSessionsForBatch returns BOTH a client and an internal session for the batch', async () => {
    const clientSession = await startSession({ magicLinkId, reviewerId })
    const internalSession = await startSession({
      kind: 'internal',
      reviewerUserId: userId,
      batchId,
    })

    const list = await listSessionsForBatch(batchId)
    const ids = list.map((s) => s.id)
    expect(ids).toContain(clientSession.id)
    expect(ids).toContain(internalSession.id)

    const internalRow = list.find((s) => s.id === internalSession.id)
    expect(internalRow?.kind).toBe('internal')
    expect(internalRow?.reviewerUserId).toBe(userId)
  })
})

describe('findSessionWithItems', () => {
  it('hydrates items in the ReviewItemHydrated shape', async () => {
    const session = await startSession({ magicLinkId, reviewerId })
    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[0],
      decision: 'approved',
    })
    await saveDraftItem({
      reviewSessionId: session.id,
      postId: postIds[1],
      decision: 'caption_edited',
      suggestedCaption: 'new copy',
      comment: 'softer tone please',
    })

    const hydrated = await findSessionWithItems({
      reviewSessionId: session.id,
    })

    expect(hydrated).not.toBeNull()
    expect(hydrated?.id).toBe(session.id)
    expect(hydrated?.status).toBe('in_progress')
    expect(hydrated?.round).toBe(1)
    expect(hydrated?.items).toHaveLength(2)

    const editedItem = hydrated?.items.find((i) => i.postId === postIds[1])
    expect(editedItem).toBeDefined()
    expect(editedItem?.decision).toBe('caption_edited')
    expect(editedItem?.suggestedCaption).toBe('new copy')
    expect(editedItem?.comment).toBe('softer tone please')
    expect(editedItem?.acceptedAsPostVersionId).toBeNull()
    expect(editedItem?.updatedSinceLastReview).toBe(false)
    expect(editedItem?.lastReviewedVersionId).toBeNull()
    expect(editedItem?.reviewedAt).toBeInstanceOf(Date)
  })

})

describe('findStaleInProgressSessions', () => {
  // A fixed "now" so the thresholds are deterministic across the suite.
  const now = new Date('2026-06-01T14:00:00Z')
  const h48 = 48 * 60 * 60 * 1000
  const h96 = 96 * 60 * 60 * 1000

  /**
   * Helper to insert a ReviewSession at an explicit `startedAt`. Bypasses
   * the repo's `startSession` because that sets startedAt = now() and we
   * need to forge older timestamps to exercise the thresholds.
   */
  async function insertSessionAt(opts: {
    startedAt: Date
    status?: 'in_progress' | 'submitted' | 'superseded'
    reminder48hSentAt?: Date | null
    reminder96hSentAt?: Date | null
    magicLinkId?: string
  }): Promise<string> {
    const row = await db.reviewSession.create({
      data: {
        batchId,
        magicLinkId: opts.magicLinkId ?? magicLinkId,
        reviewerId,
        round: 1,
        status: opts.status ?? 'in_progress',
        startedAt: opts.startedAt,
        reminder48hSentAt: opts.reminder48hSentAt ?? null,
        reminder96hSentAt: opts.reminder96hSentAt ?? null,
      },
    })
    return row.id
  }

  it('returns sessions past 48h with no reminder yet, threshold=48h', async () => {
    const id = await insertSessionAt({ startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000) })

    const rows = await findStaleInProgressSessions({ now })

    const row = rows.find((r) => r.sessionId === id)
    expect(row).toBeDefined()
    expect(row?.threshold).toBe('48h')
    expect(row?.magicLinkId).toBe(magicLinkId)
  })

  it('skips sessions younger than 48h', async () => {
    const id = await insertSessionAt({ startedAt: new Date(now.getTime() - 40 * 60 * 60 * 1000) })

    const rows = await findStaleInProgressSessions({ now })
    expect(rows.find((r) => r.sessionId === id)).toBeUndefined()
  })

  it('skips sessions already reminded at 48h when only 48h is due', async () => {
    const id = await insertSessionAt({
      startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      reminder48hSentAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    })

    const rows = await findStaleInProgressSessions({ now })
    expect(rows.find((r) => r.sessionId === id)).toBeUndefined()
  })

  it('returns sessions past 96h with threshold=96h (precedence over 48h)', async () => {
    const id = await insertSessionAt({
      startedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
    })

    const rows = await findStaleInProgressSessions({ now })
    const row = rows.find((r) => r.sessionId === id)

    expect(row).toBeDefined()
    expect(row?.threshold).toBe('96h')
  })

  it('still surfaces a 96h session when 48h was already sent', async () => {
    const id = await insertSessionAt({
      startedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
      reminder48hSentAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
    })

    const rows = await findStaleInProgressSessions({ now })
    const row = rows.find((r) => r.sessionId === id)
    expect(row?.threshold).toBe('96h')
  })

  it('skips sessions where the magic link is revoked', async () => {
    // Spin up a second magic link so we can mark just that one revoked
    // without affecting the main fixture.
    const revokedLink = await db.magicLink.create({
      data: {
        batchId,
        tokenHash: `revoked-${randomUUID()}`,
        defaultReviewerName: 'X',
        defaultReviewerEmail: `x-${randomUUID()}@test.invalid`,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        createdBy: userId,
      },
    })
    const id = await insertSessionAt({
      startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      magicLinkId: revokedLink.id,
    })

    const rows = await findStaleInProgressSessions({ now })
    expect(rows.find((r) => r.sessionId === id)).toBeUndefined()
  })

  it('skips sessions where the magic link is expired', async () => {
    const expiredLink = await db.magicLink.create({
      data: {
        batchId,
        tokenHash: `expired-${randomUUID()}`,
        defaultReviewerName: 'X',
        defaultReviewerEmail: `x2-${randomUUID()}@test.invalid`,
        expiresAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        createdBy: userId,
      },
    })
    const id = await insertSessionAt({
      startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      magicLinkId: expiredLink.id,
    })

    const rows = await findStaleInProgressSessions({ now })
    expect(rows.find((r) => r.sessionId === id)).toBeUndefined()
  })

  it('skips submitted and superseded sessions', async () => {
    const submittedId = await insertSessionAt({
      startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      status: 'submitted',
    })
    const supersededId = await insertSessionAt({
      startedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
      status: 'superseded',
    })

    const rows = await findStaleInProgressSessions({ now })
    const sids = rows.map((r) => r.sessionId)
    expect(sids).not.toContain(submittedId)
    expect(sids).not.toContain(supersededId)
  })

  it('returns the right threshold marker for a mixed-age batch', async () => {
    const a = await insertSessionAt({ startedAt: new Date(now.getTime() - 50 * h48 / 48) }) // 50h, ~48h
    const b = await insertSessionAt({ startedAt: new Date(now.getTime() - h96 - 60_000) }) // ~96h+1min

    const rows = await findStaleInProgressSessions({ now })
    const byId = new Map(rows.map((r) => [r.sessionId, r.threshold]))
    expect(byId.get(a)).toBe('48h')
    expect(byId.get(b)).toBe('96h')
  })

  it('excludes internal sessions (no email reminders for internal)', async () => {
    // A stale client session (should be returned) and a stale internal
    // session on the same batch (should be excluded).
    const clientStale = await insertSessionAt({
      startedAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
    })
    const internalStale = await db.reviewSession.create({
      data: {
        kind: 'internal',
        batchId,
        reviewerUserId: userId,
        round: 1,
        status: 'in_progress',
        startedAt: new Date(now.getTime() - 100 * 60 * 60 * 1000),
      },
    })

    const rows = await findStaleInProgressSessions({ now })
    const sids = rows.map((r) => r.sessionId)
    expect(sids).toContain(clientStale)
    expect(sids).not.toContain(internalStale.id)
  })
})
