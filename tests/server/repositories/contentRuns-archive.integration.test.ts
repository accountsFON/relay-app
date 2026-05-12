// @vitest-environment node
/**
 * Integration tests for archiveContentRun and restoreContentRun.
 *
 * These tests hit the real database. Because the functions import the
 * module-level `db` singleton we use vi.mock (with vi.hoisted) to replace
 * that singleton with a locally-created PrismaClient connected to the test DB.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client (via
 *      vi.hoisted so it runs before the mock factory).
 *   2. Build a fixture chain: Organization → Client → User + Membership →
 *      ContentRun → multiple Posts.
 *   3. Cover 5 cases:
 *      a. archive cascade: run.deletedAt set; all live posts share the same
 *         deletedAt timestamp and deletedBy.
 *      b. audit cascadeCount = 1 + post count
 *      c. archive permission gate: actor without membership throws
 *      d. restore round-trip: run + posts have null deletedAt after restore
 *      e. restore leaves separately-archived posts alone (timestamp-aware)
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
import { archiveContentRun, restoreContentRun } from '@/server/repositories/contentRuns'

afterAll(async () => {
  await pool.end()
})

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let orgId: string
let clientId: string
let runId: string
let postIds: string[]
let actorUserId: string
let unauthorizedUserId: string

beforeEach(async () => {
  const uid = randomUUID()
  postIds = []

  const org = await db.organization.create({
    data: {
      name: `test-runs-archive-org-${uid}`,
      clerkOrgId: `test-runs-archive-${uid}`,
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

  // ContentRun
  const run = await db.contentRun.create({
    data: { clientId, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
  })
  runId = run.id

  // Three posts under the run
  for (let i = 0; i < 3; i++) {
    const post = await db.post.create({
      data: {
        contentRunId: runId,
        clientId,
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
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('archiveContentRun', () => {
  it('stamps deletedAt/deletedBy on the run and all live posts with the same timestamp', async () => {
    const before = new Date()
    await archiveContentRun({ runId, actorUserId })
    const after = new Date()

    const archivedRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(archivedRun).not.toBeNull()
    expect(archivedRun!.deletedAt).not.toBeNull()
    expect(archivedRun!.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(archivedRun!.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(archivedRun!.deletedBy).toBe(actorUserId)

    const runTimestamp = archivedRun!.deletedAt!.getTime()

    for (const postId of postIds) {
      const post = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(post).not.toBeNull()
      expect(post!.deletedAt).not.toBeNull()
      expect(post!.deletedAt!.getTime()).toBe(runTimestamp)
      expect(post!.deletedBy).toBe(actorUserId)
    }
  })

  it('writes a TrashAuditLog entry with cascadeCount = 1 + post count', async () => {
    await archiveContentRun({ runId, actorUserId })

    const auditRow = await db.trashAuditLog.findFirst({
      where: { entityId: runId, action: 'archive' },
    })
    expect(auditRow).not.toBeNull()
    expect(auditRow!.entityType).toBe('contentRun')
    expect(auditRow!.actorUserId).toBe(actorUserId)
    expect(auditRow!.organizationId).toBe(orgId)
    // 1 (the run itself) + 3 (posts)
    expect(auditRow!.cascadeCount).toBe(1 + postIds.length)
    expect(auditRow!.parentContext).toMatchObject({ clientId })
  })

  it('throws when the actor has no membership in the run org', async () => {
    await expect(
      archiveContentRun({ runId, actorUserId: unauthorizedUserId }),
    ).rejects.toThrow(/permission|not authorized|forbidden/i)
  })
})

describe('restoreContentRun', () => {
  it('clears deletedAt and deletedBy on the run and all cascade-archived posts', async () => {
    await archiveContentRun({ runId, actorUserId })
    await restoreContentRun({ runId, actorUserId })

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

  it('leaves independently-archived posts alone when restoring the run (timestamp-aware)', async () => {
    // Pre-archive ONE post at a known earlier timestamp — different from the
    // cascade timestamp that archiveContentRun will use.
    const separatelyArchivedPostId = postIds[0]
    const earlierTimestamp = new Date('2026-01-01T00:00:00.000Z')
    await db.post.update({
      where: { id: separatelyArchivedPostId },
      data: { deletedAt: earlierTimestamp, deletedBy: actorUserId },
    })

    // Archive the run (stamps run + 2 remaining live posts at a later time).
    await archiveContentRun({ runId, actorUserId })

    // Restore the run — should bring back only the 2 cascade-archived posts.
    await restoreContentRun({ runId, actorUserId })

    // Run is restored.
    const restoredRun = await db.contentRun.withArchived().findFirst({ where: { id: runId } })
    expect(restoredRun!.deletedAt).toBeNull()

    // The two posts archived as part of the cascade are restored.
    for (const postId of postIds.slice(1)) {
      const post = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(post!.deletedAt).toBeNull()
    }

    // The independently-archived post remains archived.
    const separatePost = await db.post.withArchived().findFirst({
      where: { id: separatelyArchivedPostId },
    })
    expect(separatePost!.deletedAt).not.toBeNull()
    expect(separatePost!.deletedAt!.getTime()).toBe(earlierTimestamp.getTime())
  })
})
