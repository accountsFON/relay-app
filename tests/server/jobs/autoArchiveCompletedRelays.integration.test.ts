// @vitest-environment node
/**
 * Integration tests for autoArchiveCompletedRelays (runAutoArchiveCompletedRelays).
 *
 * Hits the real database. The db singleton is replaced with a locally-created
 * PrismaClient (same pattern as purgeArchivedItems.integration.test.ts).
 *
 * Phase 3 item 21 (Wave F6) behavior covered:
 *   a. A completed batch past the 30-day window is auto-archived (deletedAt
 *      stamped, deletedBy = 'system:autoArchiveCompletedRelays').
 *   b. A completed batch inside the window is left alone.
 *   c. A non-completed batch is never touched even if completedAt is somehow
 *      set in the past (belt and suspenders against the WHERE clause).
 *   d. An already-archived batch is not double-archived.
 *   e. Audit rollup writes one entry per organization.
 *   f. Posts under the auto-archived batch are NOT cascaded (distinct from
 *      manual archiveBatch, which does cascade).
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// vi.hoisted: runs before vi.mock factories, create the real db here.
// ---------------------------------------------------------------------------
const { db, pool } = await vi.hoisted(async () => {
  const path = await import('path')
  const dotenv = await import('dotenv')
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false })
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false })

  const { Pool } = await import('pg')
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { applySoftDelete } = await import('@/db/soft-delete-extension')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({ adapter, log: ['error'] })
  const db = applySoftDelete(base)
  return { db, pool }
})

// Replace the module-level singleton with our test db.
vi.mock('@/db/client', () => ({ db }))

// Import after vi.mock so the mock is in place.
import { runAutoArchiveCompletedRelays } from '@/server/jobs/autoArchiveCompletedRelays'

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, 'test-auto-archive-org-')
  await pool.end()
})

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

let orgId: string
let actorUserId: string
let createdClientIds: string[]
let createdBatchIds: string[]
let createdPostIds: string[]
let createdRunIds: string[]

beforeEach(async () => {
  const uid = randomUUID()
  createdClientIds = []
  createdBatchIds = []
  createdPostIds = []
  createdRunIds = []

  const org = await db.organization.create({
    data: { name: `test-auto-archive-org-${uid}`, clerkOrgId: `auto-archive-${uid}` },
  })
  orgId = org.id

  const user = await db.user.create({
    data: {
      clerkUserId: `auto-archive-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `auto-archive-${uid}@test.invalid`,
      name: `AutoArchive Actor ${uid}`,
    },
  })
  actorUserId = user.id
})

afterEach(async () => {
  if (!orgId) return
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  for (const id of createdClientIds) {
    await db.post.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.contentRun.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.batch.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.client.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  for (const id of createdPostIds) {
    await db.post.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  for (const id of createdBatchIds) {
    await db.batch.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } }).catch(() => {})
})

/**
 * Make a Batch row with explicit currentStep + completedAt overrides. The
 * default soft-delete extension hides withArchived rows, so anything we
 * leave as `deletedAt: null` shows up in the default findMany used by the
 * runner.
 */
async function createBatchFixture(opts: {
  currentStep: 'copy' | 'completed' | 'in_design' | 'am_review_design'
  completedAt: Date | null
  deletedAt?: Date | null
}) {
  const uid = randomUUID()
  const client = await db.client.create({
    data: { organizationId: orgId, name: `client-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })
  createdClientIds.push(client.id)

  const batch = await db.batch.create({
    data: {
      clientId: client.id,
      label: `Batch ${uid}`,
      currentStep: opts.currentStep,
      currentHolder: actorUserId,
      currentRole: 'am',
    },
  })
  createdBatchIds.push(batch.id)

  // Stamp completedAt + optional deletedAt out of band, the create call
  // does not accept them through the soft-delete extension cleanly for
  // every code path.
  if (opts.completedAt !== null || opts.deletedAt) {
    await db.batch.withArchived().update({
      where: { id: batch.id },
      data: {
        completedAt: opts.completedAt,
        deletedAt: opts.deletedAt ?? null,
        deletedBy: opts.deletedAt ? actorUserId : null,
      },
    })
  }

  return { client, batch }
}

describe('runAutoArchiveCompletedRelays — happy path', () => {
  it('archives a completed batch older than 30 days', async () => {
    const { batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: daysAgo(35),
    })

    const result = await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)
    expect(result.totals.batches).toBeGreaterThanOrEqual(1)

    const after = await db.batch.withArchived().findFirst({ where: { id: batch.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).not.toBeNull()
    expect(after!.deletedBy).toBe('system:autoArchiveCompletedRelays')
  })

  it('writes one rolled-up audit entry per organization', async () => {
    await createBatchFixture({ currentStep: 'completed', completedAt: daysAgo(35) })
    await createBatchFixture({ currentStep: 'completed', completedAt: daysAgo(40) })

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    const audits = await db.trashAuditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: 'batch',
        action: 'archive',
        actorUserId: 'system:autoArchiveCompletedRelays',
      },
    })
    expect(audits).toHaveLength(1)
    expect(audits[0].cascadeCount).toBe(2)
    const ctx = audits[0].parentContext as Record<string, unknown>
    expect(ctx.rollup).toBe(true)
    expect(ctx.reason).toBe('completed-retention')
  })
})

describe('runAutoArchiveCompletedRelays — skip cases', () => {
  it('leaves a completed batch inside the 30-day window alone', async () => {
    const { batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: daysAgo(5),
    })

    const result = await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    expect(result.totals.batches).toBe(0)

    const after = await db.batch.findFirst({ where: { id: batch.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).toBeNull()
  })

  it('leaves a completed batch at the exact 29-day boundary alone', async () => {
    const { batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: daysAgo(29),
    })

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    const after = await db.batch.findFirst({ where: { id: batch.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).toBeNull()
  })

  it('ignores a non-completed batch even with completedAt set in the past', async () => {
    // Should never happen in production but guards the WHERE clause.
    const { batch } = await createBatchFixture({
      currentStep: 'in_design',
      completedAt: daysAgo(60),
    })

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    const after = await db.batch.findFirst({ where: { id: batch.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).toBeNull()
  })

  it('skips an already-archived batch (deletedAt set)', async () => {
    const priorArchive = daysAgo(10)
    const { batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: daysAgo(45),
      deletedAt: priorArchive,
    })

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    // deletedAt should still be the prior timestamp, not the run time.
    const after = await db.batch.withArchived().findFirst({ where: { id: batch.id } })
    expect(after!.deletedAt!.getTime()).toBe(priorArchive.getTime())
    expect(after!.deletedBy).toBe(actorUserId) // not the system actor
  })

  it('leaves a completed batch with null completedAt alone', async () => {
    // Batches predating the migration backfill should not exist (the
    // migration backfills them all), but a safety check on the WHERE
    // clause: completedAt IS NULL must not match `lt: cutoff`.
    const { batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: null,
    })

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    const after = await db.batch.findFirst({ where: { id: batch.id } })
    expect(after).not.toBeNull()
    expect(after!.deletedAt).toBeNull()
  })
})

describe('runAutoArchiveCompletedRelays — no cascade to posts', () => {
  it('does not soft-delete posts under the auto-archived batch', async () => {
    const { client, batch } = await createBatchFixture({
      currentStep: 'completed',
      completedAt: daysAgo(35),
    })

    // Add a post under this batch so we can assert it stays live.
    const run = await db.contentRun.create({
      data: {
        clientId: client.id,
        triggeredById: actorUserId,
        targetMonth: '2026-05',
        status: 'queued',
      },
    })
    createdRunIds.push(run.id)

    const post = await db.post.create({
      data: {
        contentRunId: run.id,
        clientId: client.id,
        batchId: batch.id,
        postDate: new Date('2026-05-01'),
        caption: 'no-cascade test',
        hashtags: [],
        mediaUrls: [],
      },
    })
    createdPostIds.push(post.id)

    await runAutoArchiveCompletedRelays({ _testOrganizationIds: [orgId] })

    // Batch is archived...
    const batchAfter = await db.batch.withArchived().findFirst({ where: { id: batch.id } })
    expect(batchAfter!.deletedAt).not.toBeNull()

    // ...but the post is still live.
    const postAfter = await db.post.findFirst({ where: { id: post.id } })
    expect(postAfter).not.toBeNull()
    expect(postAfter!.deletedAt).toBeNull()
  })
})
