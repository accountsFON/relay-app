// @vitest-environment node
/**
 * Integration tests for archivePost and restorePost.
 *
 * These tests hit the real database. Because archivePost/restorePost import
 * the module-level `db` singleton, we use vi.mock (with vi.hoisted) to replace
 * that singleton with a locally-created PrismaClient connected to the test DB.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client (via
 *      vi.hoisted so it runs before the mock factory).
 *   2. Build a full fixture chain: Organization → Client → ContentRun → Post.
 *      Also create a User + Membership so the permission check can evaluate.
 *   3. Cover 5 cases:
 *      a. archive stamps deletedAt/deletedBy
 *      b. archive writes TrashAuditLog with cascadeCount=1 and parentContext
 *      c. archive throws when actor lacks membership
 *      d. restore clears deletedAt/deletedBy
 *      e. restore writes TrashAuditLog with action=restore
 *   4. afterEach cleans up all rows in FK-safe order.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'
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
import { archivePost, restorePost } from '@/server/repositories/posts'

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, 'test-posts-archive-org-')
  await pool.end()
})

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let orgId: string
let clientId: string
let postId: string
let actorUserId: string
let unauthorizedUserId: string

beforeEach(async () => {
  const uid = randomUUID()

  const org = await db.organization.create({
    data: {
      name: `test-posts-archive-org-${uid}`,
      clerkOrgId: `test-posts-archive-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: { organizationId: orgId, name: `test-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })
  clientId = client.id

  // Actor user + admin membership (admin role has post.edit)
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

  // ContentRun (triggeredById must reference a valid user)
  const run = await db.contentRun.create({
    data: { clientId, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
  })

  const post = await db.post.create({
    data: {
      contentRunId: run.id,
      clientId,
      postDate: new Date('2026-05-15'),
      caption: 'Test caption',
      hashtags: ['#test'],
      mediaUrls: [],
    },
  })
  postId = post.id
})

afterEach(async () => {
  if (!orgId) return
  // FK-safe teardown order: children before parents
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  await db.post.withArchived().deleteMany({ where: { clientId } })
  await db.contentRun.deleteMany({ where: { clientId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('archivePost', () => {
  it('stamps deletedAt and deletedBy on the post', async () => {
    const before = new Date()
    await archivePost({ postId, actorUserId })
    const after = new Date()

    const row = await db.post.withArchived().findFirst({ where: { id: postId } })
    expect(row).not.toBeNull()
    expect(row!.deletedAt).not.toBeNull()
    expect(row!.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(row!.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    expect(row!.deletedBy).toBe(actorUserId)
  })

  it('writes a TrashAuditLog entry with cascadeCount=1 and correct parentContext', async () => {
    await archivePost({ postId, actorUserId })

    const auditRow = await db.trashAuditLog.findFirst({
      where: { entityId: postId, action: 'archive' },
    })
    expect(auditRow).not.toBeNull()
    expect(auditRow!.entityType).toBe('post')
    expect(auditRow!.actorUserId).toBe(actorUserId)
    expect(auditRow!.organizationId).toBe(orgId)
    expect(auditRow!.cascadeCount).toBe(1)
    expect(auditRow!.parentContext).toMatchObject({ clientId })
  })

  it('throws when the actor has no membership in the post org', async () => {
    await expect(
      archivePost({ postId, actorUserId: unauthorizedUserId }),
    ).rejects.toThrow(/permission|not authorized|forbidden/i)
  })
})

describe('restorePost', () => {
  it('clears deletedAt and deletedBy after archiving', async () => {
    await archivePost({ postId, actorUserId })
    await restorePost({ postId, actorUserId })

    const row = await db.post.withArchived().findFirst({ where: { id: postId } })
    expect(row).not.toBeNull()
    expect(row!.deletedAt).toBeNull()
    expect(row!.deletedBy).toBeNull()
  })

  it('writes a TrashAuditLog entry with action=restore', async () => {
    await archivePost({ postId, actorUserId })
    await restorePost({ postId, actorUserId })

    const auditRow = await db.trashAuditLog.findFirst({
      where: { entityId: postId, action: 'restore' },
    })
    expect(auditRow).not.toBeNull()
    expect(auditRow!.entityType).toBe('post')
    expect(auditRow!.actorUserId).toBe(actorUserId)
    expect(auditRow!.organizationId).toBe(orgId)
  })
})
