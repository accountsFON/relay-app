// @vitest-environment node
/**
 * Integration tests for src/server/repositories/magicLinks.ts.
 *
 * Hits the real test DB. The lib under test imports the module-level
 * `db` singleton, so we mirror the existing pattern (see
 * batches-archive.integration.test.ts) and replace it via vi.mock with
 * a locally-created PrismaClient in vi.hoisted.
 *
 * Spec covers 4 cases:
 *   1. createMagicLink persists a hash but returns the raw token
 *   2. revokeLink sets revokedAt
 *   3. recordReviewer is idempotent on sessionId (insert then update,
 *      no duplicate row)
 *   4. lastSeen updates on subsequent visits (firstSeen unchanged)
 *
 * NOTE: spec asked for tests/server/repositories/magicLinks.test.ts.
 * Renamed to .integration.test.ts to match the existing convention —
 * any file requiring TEST_DATABASE_URL uses that suffix so npm
 * test:unit skips it. Documented in the PR.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { randomUUID } from 'crypto'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'

// MAGIC_LINK_SECRET must be set before the lib loads (it throws at module
// import time if unset).
process.env.MAGIC_LINK_SECRET =
  'test-secret-base64-min-32-bytes-xxxxxxxxxxx'

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

// Imports must come after vi.mock so the singleton replacement is in place.
let repo: typeof import('@/server/repositories/magicLinks')
let lib: typeof import('@/lib/magic-link')

beforeAll(async () => {
  repo = await import('@/server/repositories/magicLinks')
  lib = await import('@/lib/magic-link')
})

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, 'test-magic-links-org-')
  await pool.end()
})

let orgId: string
let batchId: string
let userId: string
let magicLinkIdForReviewerTests: string

beforeEach(async () => {
  const uid = randomUUID()

  const org = await db.organization.create({
    data: {
      name: `test-magic-links-org-${uid}`,
      clerkOrgId: `test-magic-links-org-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: {
      organizationId: orgId,
      name: `test-magic-links-client-${uid}`,
      postingDays: 'Mon,Wed,Fri',
    },
  })

  const user = await db.user.create({
    data: {
      clerkUserId: `test-magic-links-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `magic-links-${uid}@test.invalid`,
      name: `Magic Links User ${uid}`,
    },
  })
  userId = user.id

  const batch = await db.batch.create({
    data: {
      clientId: client.id,
      label: `test-magic-links-batch-${uid}`,
      currentStep: 'copy',
      currentHolder: userId,
      currentRole: 'am',
    },
  })
  batchId = batch.id

  // Pre-create one MagicLink for the reviewer-focused cases (3 + 4).
  const seed = await repo.createMagicLink({
    batchId,
    defaultReviewerName: 'Demo Client',
    defaultReviewerEmail: 'demo-client@test.invalid',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdBy: userId,
  })
  magicLinkIdForReviewerTests = seed.link.id
})

afterEach(async () => {
  // FK-safe: reviewers → magicLinks → batch → user/client → org.
  if (!orgId) return
  const links = await db.magicLink.findMany({
    where: { batch: { client: { organizationId: orgId } } },
    select: { id: true },
  })
  if (links.length > 0) {
    await db.magicLinkReviewer.deleteMany({
      where: { magicLinkId: { in: links.map((l) => l.id) } },
    })
    await db.magicLink.deleteMany({ where: { id: { in: links.map((l) => l.id) } } })
  }
  await db.batch.deleteMany({ where: { client: { organizationId: orgId } } })
  await db.client.deleteMany({ where: { organizationId: orgId } })
  await db.membership.deleteMany({ where: { organizationId: orgId } })
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } }).catch(() => {})
})

describe('createMagicLink', () => {
  it('persists tokenHash but returns the raw token to the caller', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const result = await repo.createMagicLink({
      batchId,
      defaultReviewerName: 'Reviewer A',
      defaultReviewerEmail: 'a@test.invalid',
      expiresAt,
      createdBy: userId,
    })

    // Raw token returned, NOT persisted as-is.
    expect(typeof result.token).toBe('string')
    expect(result.token.split('.').length).toBe(3)

    // The persisted hash is sha256(token), looking-up-able by hash.
    const expectedHash = lib.hashToken(result.token)
    expect(result.link.tokenHash).toBe(expectedHash)

    const fetched = await repo.findByTokenHash(expectedHash)
    expect(fetched?.id).toBe(result.link.id)
    expect(fetched?.batchId).toBe(batchId)

    // Token verifies cleanly back to the row id.
    const verified = lib.verifyToken(result.token)
    expect(verified?.magicLinkId).toBe(result.link.id)
  })
})

describe('revokeLink', () => {
  it('stamps revokedAt and is idempotent on a re-revoke', async () => {
    const created = await repo.createMagicLink({
      batchId,
      defaultReviewerName: 'Reviewer B',
      defaultReviewerEmail: 'b@test.invalid',
      expiresAt: new Date(Date.now() + 60_000),
      createdBy: userId,
    })

    await repo.revokeLink({ id: created.link.id, by: userId })
    const afterFirst = await db.magicLink.findUnique({
      where: { id: created.link.id },
    })
    expect(afterFirst?.revokedAt).toBeInstanceOf(Date)
    const firstRevokedAt = afterFirst?.revokedAt!

    // Re-revoke must NOT overwrite the original timestamp — the audit
    // trail anchors on first-revoked, not most-recently-clicked.
    await repo.revokeLink({ id: created.link.id, by: userId })
    const afterSecond = await db.magicLink.findUnique({
      where: { id: created.link.id },
    })
    expect(afterSecond?.revokedAt?.getTime()).toBe(firstRevokedAt.getTime())
  })
})

describe('recordReviewer', () => {
  it('upserts by sessionId without creating a duplicate row', async () => {
    const sessionId = `session-${randomUUID()}`
    const first = await repo.recordReviewer({
      magicLinkId: magicLinkIdForReviewerTests,
      name: 'Anon Client',
      email: 'anon@test.invalid',
      sessionId,
    })
    expect(first.firstSeen).toBeInstanceOf(Date)
    expect(first.sessionId).toBe(sessionId)

    // Same sessionId, second call. Must hit the same row, not create a new one.
    const second = await repo.recordReviewer({
      magicLinkId: magicLinkIdForReviewerTests,
      name: 'Anon Client',
      email: 'anon@test.invalid',
      sessionId,
    })
    expect(second.id).toBe(first.id)

    const allForSession = await db.magicLinkReviewer.findMany({
      where: { sessionId },
    })
    expect(allForSession.length).toBe(1)
  })

  it('updates lastSeen on subsequent visits while preserving firstSeen', async () => {
    const sessionId = `session-${randomUUID()}`
    const first = await repo.recordReviewer({
      magicLinkId: magicLinkIdForReviewerTests,
      name: 'Returning Client',
      sessionId,
    })
    const originalFirstSeen = first.firstSeen
    const originalLastSeen = first.lastSeen

    // Wait long enough for the timestamp comparison to be unambiguous.
    // 25 ms is small but well above the millisecond resolution of
    // Postgres timestamp(3) + JS Date.
    await new Promise((r) => setTimeout(r, 25))

    const second = await repo.recordReviewer({
      magicLinkId: magicLinkIdForReviewerTests,
      name: 'Returning Client',
      sessionId,
    })

    expect(second.id).toBe(first.id)
    // firstSeen stays anchored to the original visit.
    expect(second.firstSeen.getTime()).toBe(originalFirstSeen.getTime())
    // lastSeen advances.
    expect(second.lastSeen.getTime()).toBeGreaterThan(originalLastSeen.getTime())
  })
})
