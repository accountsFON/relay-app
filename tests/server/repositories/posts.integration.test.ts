// @vitest-environment node
/**
 * Integration tests for findPostById and updatePost.
 *
 * Verifies the cross-tenant scope check added in Phase 3A: an authenticated
 * user in Org A cannot read or write posts in Org B by passing an out-of-scope
 * post id. Mirrors the pattern in posts-archive.integration.test.ts.
 *
 * Strategy:
 *   1. Load .env.local via vi.hoisted so the mock factory can reference db.
 *   2. Fixture: two orgs (A and B), one client per org, one post per org,
 *      one user per org with admin membership, plus a "stranger" user with
 *      no membership anywhere.
 *   3. Cover:
 *      a. findPostById returns the post for in-scope actor
 *      b. findPostById returns null for cross-org actor
 *      c. findPostById returns null for stranger with no membership
 *      d. findPostById returns null for nonexistent post id
 *      e. updatePost succeeds for in-scope actor with post.edit
 *      f. updatePost throws for cross-org actor
 *      g. updatePost throws for stranger with no membership
 *   4. afterEach cleans up rows in FK-safe order.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'

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

vi.mock('@/db/client', () => ({ db }))

import type { OrgContext } from '@/lib/types'
import { findPostById, updatePost } from '@/server/repositories/posts'

const adminCtx = (organizationDbId: string, userDbId: string): OrgContext => ({
  userId: `clerk_${userDbId}`,
  orgId: `clerk_${organizationDbId}`,
  role: 'admin',
  plan: 'smb',
  organizationDbId,
  userDbId,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
})

afterAll(async () => {
  await pool.end()
})

let orgAId: string
let orgBId: string
let postAId: string
let postBId: string
let userAId: string
let userBId: string
let strangerUserId: string

beforeEach(async () => {
  const uid = randomUUID()

  // Org A and its client + post + admin user with membership
  const orgA = await db.organization.create({
    data: { name: `test-posts-orgA-${uid}`, clerkOrgId: `test-posts-orgA-${uid}` },
  })
  orgAId = orgA.id

  const clientA = await db.client.create({
    data: { organizationId: orgAId, name: `test-clientA-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })

  const userA = await db.user.create({
    data: {
      clerkUserId: `test-userA-${uid}`,
      organizationId: orgAId,
      role: 'admin',
      email: `userA-${uid}@test.invalid`,
      name: `User A ${uid}`,
    },
  })
  userAId = userA.id
  await db.membership.create({
    data: { userId: userAId, organizationId: orgAId, role: 'admin' },
  })

  const runA = await db.contentRun.create({
    data: { clientId: clientA.id, triggeredById: userAId, targetMonth: '2026-05', status: 'queued' },
  })
  const postA = await db.post.create({
    data: {
      contentRunId: runA.id,
      clientId: clientA.id,
      postDate: new Date('2026-05-15'),
      caption: 'Org A original caption',
      hashtags: ['#orgA'],
      mediaUrls: [],
    },
  })
  postAId = postA.id

  // Org B and its client + post + admin user with membership in Org B only
  const orgB = await db.organization.create({
    data: { name: `test-posts-orgB-${uid}`, clerkOrgId: `test-posts-orgB-${uid}` },
  })
  orgBId = orgB.id

  const clientB = await db.client.create({
    data: { organizationId: orgBId, name: `test-clientB-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })

  const userB = await db.user.create({
    data: {
      clerkUserId: `test-userB-${uid}`,
      organizationId: orgBId,
      role: 'admin',
      email: `userB-${uid}@test.invalid`,
      name: `User B ${uid}`,
    },
  })
  userBId = userB.id
  await db.membership.create({
    data: { userId: userBId, organizationId: orgBId, role: 'admin' },
  })

  const runB = await db.contentRun.create({
    data: { clientId: clientB.id, triggeredById: userBId, targetMonth: '2026-05', status: 'queued' },
  })
  const postB = await db.post.create({
    data: {
      contentRunId: runB.id,
      clientId: clientB.id,
      postDate: new Date('2026-05-15'),
      caption: 'Org B original caption',
      hashtags: ['#orgB'],
      mediaUrls: [],
    },
  })
  postBId = postB.id

  // Stranger: a valid User row in Org A but with NO membership anywhere
  const stranger = await db.user.create({
    data: {
      clerkUserId: `test-stranger-${uid}`,
      organizationId: orgAId,
      role: 'admin',
      email: `stranger-${uid}@test.invalid`,
      name: `Stranger ${uid}`,
    },
  })
  strangerUserId = stranger.id
})

afterEach(async () => {
  if (!orgAId && !orgBId) return
  for (const orgId of [orgAId, orgBId].filter(Boolean)) {
    await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
    const clients = await db.client.withArchived().findMany({ where: { organizationId: orgId }, select: { id: true } })
    const clientIds = clients.map((c) => c.id)
    if (clientIds.length > 0) {
      await db.post.withArchived().deleteMany({ where: { clientId: { in: clientIds } } })
      await db.contentRun.deleteMany({ where: { clientId: { in: clientIds } } })
    }
    await db.membership.deleteMany({ where: { organizationId: orgId } })
    await db.user.deleteMany({ where: { organizationId: orgId } })
    await db.client.withArchived().deleteMany({ where: { organizationId: orgId } })
    await db.organization.delete({ where: { id: orgId } })
  }
})

describe('findPostById', () => {
  it('returns the post when the actor has membership in its org', async () => {
    const post = await findPostById(postAId, adminCtx(orgAId, userAId))
    expect(post).not.toBeNull()
    expect(post!.id).toBe(postAId)
    expect(post!.caption).toBe('Org A original caption')
  })

  it('returns null when the actor has membership in a different org (cross-org leak guard)', async () => {
    const post = await findPostById(postBId, adminCtx(orgAId, userAId))
    expect(post).toBeNull()
  })

  it('returns null when the actor is in a different org (different org)', async () => {
    const post = await findPostById(postAId, adminCtx(orgBId, strangerUserId))
    expect(post).toBeNull()
  })

  it('returns null when the post id does not exist', async () => {
    const post = await findPostById('cl_nonexistent_post_id', adminCtx(orgAId, userAId))
    expect(post).toBeNull()
  })
})

describe('updatePost', () => {
  it('succeeds when the actor is an admin with membership in the post org', async () => {
    await updatePost(postAId, { caption: 'Updated by user A' }, userAId)
    const row = await db.post.findUnique({ where: { id: postAId } })
    expect(row!.caption).toBe('Updated by user A')
  })

  it('throws when the actor is in a different org (cross-org write guard)', async () => {
    await expect(
      updatePost(postBId, { caption: 'Should not land' }, userAId),
    ).rejects.toThrow(/permission|not authorized|forbidden|membership/i)

    // Confirm the row was not mutated.
    const row = await db.post.findUnique({ where: { id: postBId } })
    expect(row!.caption).toBe('Org B original caption')
  })

  it('throws when the actor has no membership anywhere', async () => {
    await expect(
      updatePost(postAId, { caption: 'Should not land' }, strangerUserId),
    ).rejects.toThrow(/permission|not authorized|forbidden|membership/i)

    const row = await db.post.findUnique({ where: { id: postAId } })
    expect(row!.caption).toBe('Org A original caption')
  })
})
