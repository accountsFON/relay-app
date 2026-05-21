// @vitest-environment node
/**
 * Integration tests for src/server/actions/notifications.ts.
 *
 * Mirrors the hoisted-Prisma + TEST_DATABASE_URL pattern from
 * tests/server/repositories/threads.integration.test.ts. Filename ends in
 * `.integration.test.ts` so the unit runner skips it; the integration
 * runner (npm run test:integration) picks it up.
 *
 * Covers submitPreviewReviewAction:
 *   1. No AM-authored unresolved comments → { notified: false }, no event
 *   2. N AM-authored comments + assigned designer → { notified: true, commentCount }
 *      emits one preview_review_submitted event + one designer Mention
 *   3. No assignedDesigner → still emits event for activity history, no Mention
 *   4. Ignores resolved comments and comments by other authors when counting
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
      '[notifications.integration.test.ts] Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
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

import { submitPreviewReviewAction } from '@/server/actions/notifications'

afterAll(async () => {
  await pool.end()
})

interface ThreadSpec {
  authorId: string | null
  body: string
  resolved: boolean
}

interface SeedResult {
  orgId: string
  clientId: string
  batchId: string
  amId: string
  designerId: string | null
}

async function seedBatchWithPostThreads(opts: {
  amId: string
  designerId: string | null
  threads: ThreadSpec[]
}): Promise<SeedResult> {
  const uid = randomUUID()
  const org = await db.organization.create({
    data: {
      name: `test-notif-org-${uid}`,
      clerkOrgId: `test-notif-org-${uid}`,
    },
  })

  // Create the AM user. The amId in the test spec is a *label*; we map it to
  // a real DB id via this map.
  const userIdMap = new Map<string, string>()

  const amUser = await db.user.create({
    data: {
      clerkUserId: `test-notif-am-${uid}`,
      organizationId: org.id,
      role: 'account_manager',
      email: `am-${uid}@test.invalid`,
      name: 'Test AM',
    },
  })
  userIdMap.set(opts.amId, amUser.id)
  await db.membership.create({
    data: { userId: amUser.id, organizationId: org.id, role: 'account_manager' },
  })

  let designerDbId: string | null = null
  if (opts.designerId) {
    const designerUser = await db.user.create({
      data: {
        clerkUserId: `test-notif-des-${uid}`,
        organizationId: org.id,
        role: 'designer',
        email: `des-${uid}@test.invalid`,
        name: 'Test Designer',
      },
    })
    userIdMap.set(opts.designerId, designerUser.id)
    designerDbId = designerUser.id
    await db.membership.create({
      data: { userId: designerUser.id, organizationId: org.id, role: 'designer' },
    })
  }

  const client = await db.client.create({
    data: {
      organizationId: org.id,
      name: `test-notif-client-${uid}`,
      assignedAmId: amUser.id,
      assignedDesignerId: designerDbId,
      postingDays: 'Mon,Wed,Fri',
    },
  })

  const run = await db.contentRun.create({
    data: {
      clientId: client.id,
      triggeredById: amUser.id,
      targetMonth: '2026-05',
      status: 'queued',
    },
  })

  const batch = await db.batch.create({
    data: {
      clientId: client.id,
      label: 'Test Batch',
      currentStep: 'am_review_design',
      currentHolder: amUser.id,
      currentRole: 'am',
    },
  })

  const post = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId: client.id,
      batchId: batch.id,
      postDate: new Date('2026-05-15'),
      caption: 'Test caption',
      hashtags: [],
      mediaUrls: [],
    },
  })

  for (const t of opts.threads) {
    const authorDbId = t.authorId ? userIdMap.get(t.authorId) ?? null : null
    const thread = await db.postThread.create({
      data: {
        postId: post.id,
        status: t.resolved ? 'resolved' : 'open',
        resolvedAt: t.resolved ? new Date() : null,
        resolvedBy: t.resolved && authorDbId ? authorDbId : null,
        createdBy: authorDbId,
      },
    })
    await db.postComment.create({
      data: {
        threadId: thread.id,
        body: t.body,
        authorId: authorDbId,
      },
    })
  }

  return {
    orgId: org.id,
    clientId: client.id,
    batchId: batch.id,
    amId: amUser.id,
    designerId: designerDbId,
  }
}

const createdOrgs: string[] = []

afterEach(async () => {
  while (createdOrgs.length) {
    const orgId = createdOrgs.pop()!
    // Walk: mention → activityEvent → postComment → postThread → post →
    // contentRun → batch → client → membership → user → organization.
    const clients = await db.client
      .withArchived()
      .findMany({ where: { organizationId: orgId }, select: { id: true } })
    const clientIds = clients.map((c) => c.id)
    if (clientIds.length > 0) {
      const events = await db.activityEvent.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true },
      })
      const eventIds = events.map((e) => e.id)
      if (eventIds.length > 0) {
        await db.mention.deleteMany({
          where: { activityEventId: { in: eventIds } },
        })
        await db.activityEvent.deleteMany({ where: { id: { in: eventIds } } })
      }
      const posts = await db.post
        .withArchived()
        .findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })
      const postIds = posts.map((p) => p.id)
      if (postIds.length > 0) {
        await db.postComment.deleteMany({
          where: { thread: { postId: { in: postIds } } },
        })
        await db.postThread.deleteMany({ where: { postId: { in: postIds } } })
        await db.post.withArchived().deleteMany({ where: { id: { in: postIds } } })
      }
      await db.batch.withArchived().deleteMany({ where: { clientId: { in: clientIds } } })
      await db.contentRun.deleteMany({ where: { clientId: { in: clientIds } } })
    }
    await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
    await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
    await db.membership.deleteMany({ where: { organizationId: orgId } })
    await db.user.deleteMany({ where: { organizationId: orgId } })
    await db.organization.delete({ where: { id: orgId } })
  }
})

describe('submitPreviewReviewAction', () => {
  it('returns { notified: false } when no AM-authored unresolved comments', async () => {
    const seed = await seedBatchWithPostThreads({
      amId: 'am1',
      designerId: 'des1',
      threads: [],
    })
    createdOrgs.push(seed.orgId)

    const result = await submitPreviewReviewAction({
      batchId: seed.batchId,
      actorUserId: seed.amId,
    })

    expect(result).toEqual({ notified: false })
    const events = await db.activityEvent.findMany({
      where: { clientId: seed.clientId, kind: 'preview_review_submitted' },
    })
    expect(events).toHaveLength(0)
    const mentions = await db.mention.findMany({
      where: { mentionedUserId: seed.designerId! },
    })
    expect(mentions).toHaveLength(0)
  })

  it('emits event + designer mention when AM comments exist', async () => {
    const seed = await seedBatchWithPostThreads({
      amId: 'am1',
      designerId: 'des1',
      threads: [
        { authorId: 'am1', body: 'tighten', resolved: false },
        { authorId: 'am1', body: 'check color', resolved: false },
      ],
    })
    createdOrgs.push(seed.orgId)

    const result = await submitPreviewReviewAction({
      batchId: seed.batchId,
      actorUserId: seed.amId,
    })

    expect(result).toEqual({ notified: true, commentCount: 2 })
    const events = await db.activityEvent.findMany({
      where: { clientId: seed.clientId, kind: 'preview_review_submitted' },
    })
    expect(events).toHaveLength(1)
    expect(events[0].actorId).toBe(seed.amId)
    const mentions = await db.mention.findMany({
      where: { activityEventId: events[0].id },
    })
    expect(mentions.map((m) => m.mentionedUserId)).toEqual([seed.designerId])
  })

  it('emits event but no Mention when no assigned designer', async () => {
    const seed = await seedBatchWithPostThreads({
      amId: 'am1',
      designerId: null,
      threads: [{ authorId: 'am1', body: 'note', resolved: false }],
    })
    createdOrgs.push(seed.orgId)

    const result = await submitPreviewReviewAction({
      batchId: seed.batchId,
      actorUserId: seed.amId,
    })

    expect(result).toEqual({ notified: true, commentCount: 1 })
    const events = await db.activityEvent.findMany({
      where: { clientId: seed.clientId, kind: 'preview_review_submitted' },
    })
    expect(events).toHaveLength(1)
    const mentions = await db.mention.findMany({
      where: { activityEventId: events[0].id },
    })
    expect(mentions).toHaveLength(0)
  })

  it('ignores resolved comments and other authors when counting', async () => {
    const seed = await seedBatchWithPostThreads({
      amId: 'am1',
      designerId: 'des1',
      threads: [
        { authorId: 'am1', body: 'old', resolved: true },
        { authorId: 'des1', body: 'designer talking', resolved: false },
        { authorId: 'am1', body: 'new', resolved: false },
      ],
    })
    createdOrgs.push(seed.orgId)

    const result = await submitPreviewReviewAction({
      batchId: seed.batchId,
      actorUserId: seed.amId,
    })

    expect(result).toEqual({ notified: true, commentCount: 1 })
  })
})
