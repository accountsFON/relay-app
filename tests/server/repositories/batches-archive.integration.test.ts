// @vitest-environment node
/**
 * Integration tests for archiveBatch and restoreBatch.
 *
 * These tests hit the real database. Because archiveBatch/restoreBatch import
 * the module-level `db` singleton we use vi.mock (with vi.hoisted) to replace
 * that singleton with a locally-created PrismaClient connected to the test DB.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client (via
 *      vi.hoisted so it runs before the mock factory).
 *   2. Build a fixture chain: Organization → Client → User + Membership →
 *      Batch → ContentRun → multiple Posts (linked to both the run and batch).
 *   3. Cover 5 cases:
 *      a. archive cascade timestamp match: batch + affected runs + live posts
 *         all receive the same deletedAt timestamp.
 *      b. cascadeCount accuracy: equals 1 + run count + post count.
 *      c. permission gate: actor without membership throws.
 *      d. restore round-trip: batch + runs + posts have null deletedAt after restore.
 *      e. timestamp-aware restore: pre-archived posts at a different timestamp
 *         are left alone when the batch is restored.
 *   4. afterEach cleans up all rows in FK-safe order.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// vi.hoisted: runs before vi.mock factories — create the real db here so the
// mock factory can reference it.
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
import { archiveBatch, restoreBatch } from '@/server/repositories/batches'

afterAll(async () => {
  await pool.end()
})

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let orgId: string
let clientId: string
let batchId: string
let runId: string
let postIds: string[]
let actorUserId: string
let unauthorizedUserId: string

beforeEach(async () => {
  const uid = randomUUID()
  postIds = []

  const org = await db.organization.create({
    data: {
      name: `test-batches-archive-org-${uid}`,
      clerkOrgId: `test-batches-archive-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: { organizationId: orgId, name: `test-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })
  clientId = client.id

  // Actor user + admin membership (admin role has run.delete)
  const actorUser = await db.user.create({
    data: {
      clerkUserId: `test-actor-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `actor-${uid}@test.invalid`,
      name: `Actor ${uid}`,
    },
  })
  actorUserId = actorUser.id
  await db.membership.create({
    data: { userId: actorUserId, organizationId: orgId, role: 'admin' },
  })

  // Unauthorized user — valid User row but NO Membership for this org
  const unauthorizedUser = await db.user.create({
    data: {
      clerkUserId: `test-unauth-${uid}`,
      organizationId: orgId,
      role: 'client',
      email: `unauth-${uid}@test.invalid`,
      name: `Unauth ${uid}`,
    },
  })
  unauthorizedUserId = unauthorizedUser.id
  // Intentionally NOT creating a Membership for unauthorizedUser

  // Batch
  const batch = await db.batch.create({
    data: {
      clientId,
      label: `Test Batch ${uid}`,
      currentStep: 'copy',
      currentHolder: actorUserId,
      currentRole: 'am',
    },
  })
  batchId = batch.id

  // ContentRun — shares the same client
  const run = await db.contentRun.create({
    data: { clientId, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
  })
  runId = run.id

  // Three posts linked to both the run and the batch
  for (let i = 0; i < 3; i++) {
    const post = await db.post.create({
      data: {
        contentRunId: runId,
        clientId,
        batchId,
        postDate: new Date(`2026-05-${15 + i}`),
        caption: `Test caption ${i}`,
        hashtags: ['#test'],
        mediaUrls: [],
      },
    })
    postIds.push(post.id)
  }
})

afterEach(async () => {
  if (!orgId) return
  // FK-safe teardown order: children before parents
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  await db.post.withArchived().deleteMany({ where: { clientId } })
  await db.contentRun.withArchived().deleteMany({ where: { clientId } })
  await db.batch.withArchived().deleteMany({ where: { clientId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('archiveBatch', () => {
  it('stamps the same deletedAt on the batch, its affected ContentRuns, and all live posts', async () => {
    const before = new Date()
    await archiveBatch({ batchId, actorUserId })
    const after = new Date()

    const archivedBatch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
    expect(archivedBatch).not.toBeNull()
    expect(archivedBatch!.deletedAt).not.toBeNull()
    expect(archivedBatch!.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(archivedBatch!.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(archivedBatch!.deletedBy).toBe(actorUserId)

    const batchTimestamp = archivedBatch!.deletedAt!.getTime()

    // The ContentRun that has posts in this batch should be stamped.
    const archivedRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(archivedRun).not.toBeNull()
    expect(archivedRun!.deletedAt).not.toBeNull()
    expect(archivedRun!.deletedAt!.getTime()).toBe(batchTimestamp)
    expect(archivedRun!.deletedBy).toBe(actorUserId)

    // All live posts in the batch should share the same timestamp.
    for (const postId of postIds) {
      const post = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(post).not.toBeNull()
      expect(post!.deletedAt).not.toBeNull()
      expect(post!.deletedAt!.getTime()).toBe(batchTimestamp)
      expect(post!.deletedBy).toBe(actorUserId)
    }
  })

  it('writes a TrashAuditLog with cascadeCount = 1 + run count + post count', async () => {
    await archiveBatch({ batchId, actorUserId })

    const auditRow = await db.trashAuditLog.findFirst({
      where: { entityId: batchId, action: 'archive' },
    })
    expect(auditRow).not.toBeNull()
    expect(auditRow!.entityType).toBe('batch')
    expect(auditRow!.actorUserId).toBe(actorUserId)
    expect(auditRow!.organizationId).toBe(orgId)
    // 1 (batch) + 1 (run) + 3 (posts)
    expect(auditRow!.cascadeCount).toBe(1 + 1 + postIds.length)
    expect(auditRow!.parentContext).toMatchObject({ clientId })
  })

  it('throws when the actor has no membership in the batch org', async () => {
    await expect(
      archiveBatch({ batchId, actorUserId: unauthorizedUserId }),
    ).rejects.toThrow(/permission|not authorized|forbidden/i)
  })
})

describe('restoreBatch', () => {
  it('clears deletedAt and deletedBy on the batch, runs, and cascade-archived posts', async () => {
    await archiveBatch({ batchId, actorUserId })
    await restoreBatch({ batchId, actorUserId })

    const restoredBatch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
    expect(restoredBatch).not.toBeNull()
    expect(restoredBatch!.deletedAt).toBeNull()
    expect(restoredBatch!.deletedBy).toBeNull()

    const restoredRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(restoredRun).not.toBeNull()
    expect(restoredRun!.deletedAt).toBeNull()
    expect(restoredRun!.deletedBy).toBeNull()

    for (const postId of postIds) {
      const post = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(post).not.toBeNull()
      expect(post!.deletedAt).toBeNull()
      expect(post!.deletedBy).toBeNull()
    }
  })

  it('leaves pre-archived posts alone when restoring (timestamp-aware)', async () => {
    // Pre-archive ONE post at a known earlier timestamp — different from the
    // cascade timestamp that archiveBatch will use.
    const separatelyArchivedPostId = postIds[0]
    const earlierTimestamp = new Date('2026-01-01T00:00:00.000Z')
    await db.post.update({
      where: { id: separatelyArchivedPostId },
      data: { deletedAt: earlierTimestamp, deletedBy: actorUserId },
    })

    // Archive the batch (stamps batch + run + 2 remaining live posts at a later time).
    await archiveBatch({ batchId, actorUserId })

    // Restore the batch — should bring back only the cascade-archived posts + run.
    await restoreBatch({ batchId, actorUserId })

    // Batch is restored.
    const restoredBatch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
    expect(restoredBatch!.deletedAt).toBeNull()

    // Run is restored.
    const restoredRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(restoredRun!.deletedAt).toBeNull()

    // The two posts archived as part of the cascade are restored.
    for (const postId of postIds.slice(1)) {
      const post = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(post!.deletedAt).toBeNull()
    }

    // The independently-archived post remains archived at its original timestamp.
    const separatePost = await db.post.withArchived().findFirst({
      where: { id: separatelyArchivedPostId },
    })
    expect(separatePost!.deletedAt).not.toBeNull()
    expect(separatePost!.deletedAt!.getTime()).toBe(earlierTimestamp.getTime())
  })
})
