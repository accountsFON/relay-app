// @vitest-environment node
/**
 * Integration tests for the approval derivation service.
 *
 * 3 cases per spec:
 *   1. all resolved threads = ready
 *   2. any open thread = pending
 *   3. zero threads = ready
 *
 * Uses the same hoisted-Prisma + .env.local pattern as
 * tests/server/repositories/threads.test.ts so the suite picks up
 * TEST_DATABASE_URL when run via `npx vitest run` directly.
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
      '[approval.test.ts] Neither TEST_DATABASE_URL nor DATABASE_URL is set. ' +
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

import { derivePostApproval } from '@/server/services/approval'
import {
  createThread,
  resolveThread,
} from '@/server/repositories/threads'

afterAll(async () => {
  await pool.end()
})

let orgId: string = ''
let clientId: string = ''
let userId: string = ''
// batchId is referenced below to keep the import-graph honest; the
// per-post derivation is the only thing under test in v1.
let batchId: string = ''
let postWithOpen: string = ''
let postWithResolved: string = ''
let postEmpty: string = ''

beforeEach(async () => {
  const uid = randomUUID()
  const org = await db.organization.create({
    data: {
      name: `test-approval-org-${uid}`,
      clerkOrgId: `test-approval-org-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: {
      organizationId: orgId,
      name: `test-approval-client-${uid}`,
      postingDays: 'Mon,Wed,Fri',
    },
  })
  clientId = client.id

  const user = await db.user.create({
    data: {
      clerkUserId: `test-approval-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `approval-${uid}@test.invalid`,
      name: `Approval User ${uid}`,
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

  const batch = await db.batch.create({
    data: {
      clientId,
      label: `test-approval-batch-${uid}`,
      currentStep: 'final_qa_schedule',
      currentHolder: userId,
      currentRole: 'am',
    },
  })
  batchId = batch.id

  // Three posts in the batch: one with an open thread, one with a resolved
  // thread, one with no threads at all.
  const p1 = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId,
      batchId,
      postDate: new Date('2026-05-01'),
      caption: 'open caption',
      hashtags: [],
      mediaUrls: [],
    },
  })
  postWithOpen = p1.id

  const p2 = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId,
      batchId,
      postDate: new Date('2026-05-08'),
      caption: 'resolved caption',
      hashtags: [],
      mediaUrls: [],
    },
  })
  postWithResolved = p2.id

  const p3 = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId,
      batchId,
      postDate: new Date('2026-05-15'),
      caption: 'empty caption',
      hashtags: [],
      mediaUrls: [],
    },
  })
  postEmpty = p3.id
})

afterEach(async () => {
  if (!orgId) return
  const posts = await db.post
    .withArchived()
    .findMany({ where: { clientId }, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  if (postIds.length > 0) {
    await db.postComment.deleteMany({ where: { thread: { postId: { in: postIds } } } })
    await db.postThread.deleteMany({ where: { postId: { in: postIds } } })
    await db.post.withArchived().deleteMany({ where: { id: { in: postIds } } })
  }
  await db.batch.deleteMany({ where: { clientId } })
  await db.contentRun.deleteMany({ where: { clientId } })
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

const author = (uid: string) => ({ kind: 'am' as const, userId: uid })

describe('derivePostApproval', () => {
  it('returns ready when every thread on the post is resolved', async () => {
    const t = await createThread({
      postId: postWithResolved,
      pin: { kind: 'post' },
      body: 'fix this',
      author: author(userId),
    })
    await resolveThread({
      threadId: t.threadId,
      resolvedBy: userId,
      resolvedReason: 'addressed',
    })

    expect(await derivePostApproval(postWithResolved)).toBe('ready')
  })

  it('returns pending when at least one thread is open', async () => {
    await createThread({
      postId: postWithOpen,
      pin: { kind: 'post' },
      body: 'still wrong',
      author: author(userId),
    })

    expect(await derivePostApproval(postWithOpen)).toBe('pending')
  })

  it('returns ready for a post with zero threads', async () => {
    expect(await derivePostApproval(postEmpty)).toBe('ready')
  })
})

// derivePostApprovalForBatch is a thin sum of derivePostApproval and is
// exercised at the action / page layer in Layer 2. The batchId fixture
// stays in beforeEach so the three posts share a real batch row.
void batchId
