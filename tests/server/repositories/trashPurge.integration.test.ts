// @vitest-environment node
/**
 * Integration tests for purgeEntity.
 *
 * These tests hit the real database. Because purgeEntity imports the
 * module-level `db` singleton we use vi.mock (with vi.hoisted) to replace
 * that singleton with a locally-created PrismaClient connected to the test DB.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client (via
 *      vi.hoisted so it runs before the mock factory).
 *   2. Build a fixture chain: Organization → Client → User + Membership →
 *      Batch → ContentRun → multiple Posts.
 *   3. Cover 6 cases:
 *      a. post purge: row gone, audit written (Org Admin actor).
 *      b. post purge throws when post is not archived (live row).
 *      c. post purge throws when actor is not Org Admin (account_manager role).
 *      d. batch purge cascades: batch + its cascade-archived posts + runs deleted.
 *      e. client purge cascades via FK: client + all children gone.
 *      f. purge throws when entity is not found.
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
import { purgeEntity } from '@/server/repositories/trashPurge'

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
let nonAdminUserId: string

beforeEach(async () => {
  const uid = randomUUID()
  postIds = []

  const org = await db.organization.create({
    data: {
      name: `test-purge-org-${uid}`,
      clerkOrgId: `test-purge-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: { organizationId: orgId, name: `test-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })
  clientId = client.id

  // Org Admin actor — admin role has admin.portal permission
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

  // Non-admin user — account_manager role does NOT have admin.portal
  const nonAdminUser = await db.user.create({
    data: {
      clerkUserId: `test-am-${uid}`,
      organizationId: orgId,
      role: 'account_manager',
      email: `am-${uid}@test.invalid`,
      name: `AM ${uid}`,
    },
  })
  nonAdminUserId = nonAdminUser.id
  await db.membership.create({
    data: { userId: nonAdminUserId, organizationId: orgId, role: 'account_manager' },
  })

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

  // ContentRun — direct clientId relation
  const run = await db.contentRun.create({
    data: { clientId, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
  })
  runId = run.id

  // Three posts linked to the run, batch, and client directly
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
  // FK-safe teardown order: children before parents.
  // Use withArchived() since purge hard-deletes rows; rows not yet purged may
  // still be soft-deleted.
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  // These are no-ops if the purge test already deleted the rows.
  await db.post.withArchived().deleteMany({ where: { clientId } }).catch(() => {})
  await db.contentRun.withArchived().deleteMany({ where: { clientId } }).catch(() => {})
  await db.batch.withArchived().deleteMany({ where: { clientId } }).catch(() => {})
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } }).catch(() => {})
  await db.organization.delete({ where: { id: orgId } }).catch(() => {})
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('purgeEntity — post', () => {
  it('hard-deletes the post row and writes a purge audit entry', async () => {
    // Archive the post first so it is in the correct state for purge.
    const now = new Date()
    await db.post.update({
      where: { id: postIds[0] },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    await purgeEntity({ entityType: 'post', entityId: postIds[0], actorUserId })

    // Row must be gone — even withArchived should not find it.
    const gone = await db.post.withArchived().findFirst({ where: { id: postIds[0] } })
    expect(gone).toBeNull()

    // Audit log must exist with action = 'purge'.
    const audit = await db.trashAuditLog.findFirst({
      where: { entityId: postIds[0], action: 'purge' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.entityType).toBe('post')
    expect(audit!.actorUserId).toBe(actorUserId)
    expect(audit!.organizationId).toBe(orgId)
    expect(audit!.cascadeCount).toBe(1)
  })

  it('throws when the post is not archived (live row cannot be purged)', async () => {
    // postIds[0] is live (not archived) by default in beforeEach.
    await expect(
      purgeEntity({ entityType: 'post', entityId: postIds[0], actorUserId }),
    ).rejects.toThrow(/not archived/i)
  })

  it('throws when the actor is not an Org Admin (account_manager is refused)', async () => {
    // Archive the post so the permission check is reached.
    const now = new Date()
    await db.post.update({
      where: { id: postIds[0] },
      data: { deletedAt: now, deletedBy: actorUserId },
    })

    await expect(
      purgeEntity({ entityType: 'post', entityId: postIds[0], actorUserId: nonAdminUserId }),
    ).rejects.toThrow(/forbidden|only org admin|admin/i)
  })
})

describe('purgeEntity — batch (manual cascade because Post.batchId is SetNull)', () => {
  it('hard-deletes the batch, its cascade-archived posts, and its cascade-archived runs', async () => {
    // Archive the batch cascade: stamp batch + run + posts at the same timestamp.
    const cascadeTs = new Date()
    await db.batch.update({
      where: { id: batchId },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })
    await db.contentRun.update({
      where: { id: runId },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })
    await db.post.updateMany({
      where: { batchId, deletedAt: null },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })

    await purgeEntity({ entityType: 'batch', entityId: batchId, actorUserId })

    // Batch gone.
    const goneBatch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
    expect(goneBatch).toBeNull()

    // ContentRun (archived as part of cascade) gone.
    const goneRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(goneRun).toBeNull()

    // All cascade-archived posts gone.
    for (const postId of postIds) {
      const gonePost = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(gonePost).toBeNull()
    }

    // Audit entry written.
    const audit = await db.trashAuditLog.findFirst({
      where: { entityId: batchId, action: 'purge' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.entityType).toBe('batch')
    // 1 (batch) + 1 (run) + 3 (posts)
    expect(audit!.cascadeCount).toBe(1 + 1 + postIds.length)
  })
})

describe('purgeEntity — client (FK cascade)', () => {
  it('hard-deletes client and all children via FK cascade', async () => {
    // Archive client + all children (mimicking archiveClient behavior).
    const cascadeTs = new Date()
    await db.client.update({
      where: { id: clientId },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })
    await db.batch.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })
    await db.contentRun.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })
    await db.post.updateMany({
      where: { clientId, deletedAt: null },
      data: { deletedAt: cascadeTs, deletedBy: actorUserId },
    })

    await purgeEntity({ entityType: 'client', entityId: clientId, actorUserId })

    // Client gone.
    const goneClient = await db.client.withArchived().findFirst({ where: { id: clientId } })
    expect(goneClient).toBeNull()

    // All children gone (FK cascade deleted them).
    const goneBatch = await db.batch.withArchived().findFirst({ where: { id: batchId } })
    expect(goneBatch).toBeNull()

    const goneRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(goneRun).toBeNull()

    for (const postId of postIds) {
      const gonePost = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(gonePost).toBeNull()
    }

    // Audit entry written with accurate cascadeCount.
    const audit = await db.trashAuditLog.findFirst({
      where: { entityId: clientId, action: 'purge' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.entityType).toBe('client')
    // 1 (client) + 1 (batch) + 1 (run) + 3 (posts)
    expect(audit!.cascadeCount).toBe(1 + 1 + 1 + postIds.length)
  })
})

describe('purgeEntity — not found', () => {
  it('throws when the entity does not exist', async () => {
    const fakeId = randomUUID()
    await expect(
      purgeEntity({ entityType: 'post', entityId: fakeId, actorUserId }),
    ).rejects.toThrow(/not found/i)
  })
})
