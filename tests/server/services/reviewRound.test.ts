// @vitest-environment node
/**
 * Integration tests for the Round 2 auto-carry service.
 *
 * 4 cases (per Task 2.4 spec):
 *   1. carries approval when post unchanged between rounds
 *   2. resets to not_reviewed when post.currentVersion drifted from
 *      lastReviewedVersionId (AM edited the post between rounds)
 *   3. sets updatedSinceLastReview = true on reset items
 *   4. emits a `review_round_started` ActivityEvent with the correct
 *      payload
 *
 * Mirrors the hoisted-Prisma + .env.local pattern from
 * `tests/server/repositories/reviewSessions.integration.test.ts` so the
 * suite picks up TEST_DATABASE_URL when run directly via `npx vitest run`.
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
      '[reviewRound.test.ts] Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
        'Add TEST_DATABASE_URL to .env.local.',
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

import { startNextRound } from '@/server/services/reviewRound'
import {
  startSession,
  saveDraftItem,
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
let postIds: string[]
let versionByPost: Map<string, string>

beforeEach(async () => {
  const uid = randomUUID()

  const org = await db.organization.create({
    data: { name: `rr-org-${uid}`, clerkOrgId: `rr-org-${uid}` },
  })
  orgId = org.id

  const client = await db.client.create({
    data: {
      organizationId: orgId,
      name: `rr-client-${uid}`,
      postingDays: 'Mon,Wed,Fri',
    },
  })
  clientId = client.id

  const user = await db.user.create({
    data: {
      clerkUserId: `rr-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `rr-user-${uid}@test.invalid`,
      name: `RR User ${uid}`,
    },
  })
  userId = user.id
  await db.membership.create({
    data: { userId, organizationId: orgId, role: 'admin' },
  })

  const batch = await db.batch.create({
    data: {
      clientId,
      label: `rr-batch-${uid}`,
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

  // 3 posts. Each gets a PostVersion so we can simulate the "current
  // version" lookup.
  const posts = await Promise.all(
    [0, 1, 2].map((i) =>
      db.post.create({
        data: {
          contentRunId: run.id,
          clientId,
          batchId: batch.id,
          postDate: new Date(`2026-05-${15 + i}`),
          caption: `Post ${i} v1`,
          hashtags: [],
          mediaUrls: [],
        },
      }),
    ),
  )
  postIds = posts.map((p) => p.id)

  versionByPost = new Map()
  for (const post of posts) {
    const v = await db.postVersion.create({
      data: {
        postId: post.id,
        authorId: userId,
        caption: post.caption,
        hashtags: [],
        graphicHook: null,
        designerNotes: null,
        editAuthorRole: 'am',
        editOrigin: 'manual',
      },
    })
    versionByPost.set(post.id, v.id)
  }

  const link = await db.magicLink.create({
    data: {
      batchId,
      tokenHash: `rr-hash-${uid}`,
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
      sessionId: `rr-sess-${uid}`,
    },
  })
  reviewerId = reviewer.id
})

afterEach(async () => {
  if (!orgId) return
  await db.reviewItem.deleteMany({ where: { reviewSession: { magicLinkId } } })
  await db.reviewSession.deleteMany({ where: { magicLinkId } })
  await db.magicLinkReviewer.deleteMany({ where: { magicLinkId } })
  await db.magicLink.deleteMany({ where: { batchId } })

  const posts = await db.post
    .withArchived()
    .findMany({ where: { clientId }, select: { id: true } })
  const pids = posts.map((p) => p.id)
  if (pids.length > 0) {
    await db.postVersion.deleteMany({ where: { postId: { in: pids } } })
    await db.post.withArchived().deleteMany({ where: { id: { in: pids } } })
  }
  await db.activityEvent.deleteMany({ where: { clientId } })
  await db.contentRun.deleteMany({ where: { clientId } })
  await db.batch.deleteMany({ where: { clientId } })
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

// Helper: seed a submitted round 1 session with the given decisions and
// `lastReviewedVersionId` per post.
async function seedRound1(
  decisions: Array<{
    postId: string
    decision: 'approved' | 'changes_requested' | 'caption_edited' | 'not_reviewed'
    lastReviewedVersionId: string | null
  }>,
): Promise<string> {
  const session = await startSession({ magicLinkId, reviewerId })
  for (const d of decisions) {
    if (d.decision !== 'not_reviewed') {
      await saveDraftItem({
        reviewSessionId: session.id,
        postId: d.postId,
        decision: d.decision,
      })
    }
    // Patch lastReviewedVersionId directly (the v2 flow records this on
    // the reviewer-side action when the page renders the post).
    await db.reviewItem.upsert({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: session.id,
          postId: d.postId,
        },
      },
      create: {
        reviewSessionId: session.id,
        postId: d.postId,
        decision: d.decision,
        lastReviewedVersionId: d.lastReviewedVersionId,
      },
      update: { lastReviewedVersionId: d.lastReviewedVersionId },
    })
  }
  await submitSession({ reviewSessionId: session.id })
  return session.id
}

// ---- Tests ----

describe('startNextRound', () => {
  it('carries approval when post is unchanged between rounds', async () => {
    // Round 1: post[0] approved against its current version.
    await seedRound1([
      {
        postId: postIds[0],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[0])!,
      },
      {
        postId: postIds[1],
        decision: 'changes_requested',
        lastReviewedVersionId: versionByPost.get(postIds[1])!,
      },
      {
        postId: postIds[2],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[2])!,
      },
    ])
    // AM "opens" a new round by calling startNextRound (in real flow
    // they would have addressed the change-requested item first; the
    // service itself does not gate on item state).
    const next = await startNextRound({ magicLinkId, by: userId })

    expect(next.round).toBe(2)
    expect(next.status).toBe('in_progress')
    expect(next.reviewerId).toBe(reviewerId)

    const carried = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[0],
        },
      },
    })
    expect(carried?.decision).toBe('approved')
    expect(carried?.updatedSinceLastReview).toBe(false)
    expect(carried?.lastReviewedVersionId).toBe(versionByPost.get(postIds[0])!)
  })

  it('resets to not_reviewed when post.currentVersion drifted from lastReviewedVersionId', async () => {
    const originalVersion = versionByPost.get(postIds[0])!
    await seedRound1([
      {
        postId: postIds[0],
        decision: 'approved',
        lastReviewedVersionId: originalVersion,
      },
      {
        postId: postIds[1],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[1])!,
      },
      {
        postId: postIds[2],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[2])!,
      },
    ])

    // AM edits post[0] between rounds → new PostVersion is now the
    // current version, and it does NOT match what the client signed off
    // on.
    await db.postVersion.create({
      data: {
        postId: postIds[0],
        authorId: userId,
        caption: 'Post 0 v2 — AM edited',
        hashtags: [],
        graphicHook: null,
        designerNotes: null,
        editAuthorRole: 'am',
        editOrigin: 'manual',
      },
    })

    const next = await startNextRound({ magicLinkId, by: userId })

    const reset = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[0],
        },
      },
    })
    expect(reset?.decision).toBe('not_reviewed')
    // Prior lastReviewedVersionId is kept around for the diff banner.
    expect(reset?.lastReviewedVersionId).toBe(originalVersion)

    // Sanity: unedited posts still carry their approval.
    const stillApproved = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[1],
        },
      },
    })
    expect(stillApproved?.decision).toBe('approved')
  })

  it('sets updatedSinceLastReview = true on reset items', async () => {
    const originalVersion = versionByPost.get(postIds[0])!
    await seedRound1([
      {
        postId: postIds[0],
        decision: 'approved',
        lastReviewedVersionId: originalVersion,
      },
      {
        postId: postIds[1],
        decision: 'changes_requested',
        lastReviewedVersionId: versionByPost.get(postIds[1])!,
      },
      {
        postId: postIds[2],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[2])!,
      },
    ])

    // AM edits post[0] (approved last round → would have carried).
    await db.postVersion.create({
      data: {
        postId: postIds[0],
        authorId: userId,
        caption: 'Post 0 v2',
        hashtags: [],
        graphicHook: null,
        designerNotes: null,
      },
    })

    const next = await startNextRound({ magicLinkId, by: userId })

    const editedItem = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[0],
        },
      },
    })
    expect(editedItem?.decision).toBe('not_reviewed')
    expect(editedItem?.updatedSinceLastReview).toBe(true)

    // post[1] had changes_requested last round → must reset regardless
    // of edits, and is flagged updated for the new round (per spec:
    // "Otherwise → create a new ReviewItem with updatedSinceLastReview
    // = true").
    const changeReqItem = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[1],
        },
      },
    })
    expect(changeReqItem?.decision).toBe('not_reviewed')
    expect(changeReqItem?.updatedSinceLastReview).toBe(true)

    // post[2] carried as approved → updatedSinceLastReview is false.
    const carriedItem = await db.reviewItem.findUnique({
      where: {
        reviewSessionId_postId: {
          reviewSessionId: next.id,
          postId: postIds[2],
        },
      },
    })
    expect(carriedItem?.decision).toBe('approved')
    expect(carriedItem?.updatedSinceLastReview).toBe(false)
  })

  it('emits a review_round_started ActivityEvent with correct payload', async () => {
    await seedRound1([
      {
        postId: postIds[0],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[0])!,
      },
      {
        postId: postIds[1],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[1])!,
      },
      {
        postId: postIds[2],
        decision: 'approved',
        lastReviewedVersionId: versionByPost.get(postIds[2])!,
      },
    ])

    const next = await startNextRound({ magicLinkId, by: userId })

    const events = await db.activityEvent.findMany({
      where: { clientId, kind: 'review_round_started' },
    })
    expect(events).toHaveLength(1)
    expect(events[0].actorId).toBe(userId)
    expect(events[0].payload).toMatchObject({
      magicLinkId,
      round: next.round,
    })
  })
})
