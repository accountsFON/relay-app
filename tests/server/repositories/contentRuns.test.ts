// @vitest-environment node
/**
 * Tests for createContentRun — specifically the targetBatchId parameter
 * added for the pre-flight Replace flow.
 *
 * Follows the integration test pattern used by contentRuns-archive.integration.test.ts:
 * vi.hoisted loads the real DB singleton, and vi.mock replaces @/db/client with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// vi.hoisted: runs before vi.mock factories — build the real db client here.
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
import { createContentRun, findMatchingBatchForRun, findMatchingBatchForClientMonth } from '@/server/repositories/contentRuns'

afterAll(async () => {
  await pool.end()
})

// ---------------------------------------------------------------------------
// Fixture state
// ---------------------------------------------------------------------------

let orgId: string
let clientId: string
let userId: string

beforeEach(async () => {
  const uid = randomUUID()

  const org = await db.organization.create({
    data: {
      name: `test-create-run-org-${uid}`,
      clerkOrgId: `test-create-run-${uid}`,
    },
  })
  orgId = org.id

  const client = await db.client.create({
    data: { organizationId: orgId, name: `test-client-${uid}` },
  })
  clientId = client.id

  const user = await db.user.create({
    data: {
      clerkUserId: `test-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `user-${uid}@test.invalid`,
      name: `Test User ${uid}`,
    },
  })
  userId = user.id

  await db.membership.create({
    data: { userId, organizationId: orgId, role: 'admin' },
  })
})

afterEach(async () => {
  if (!orgId) return
  // FK-safe teardown order: children before parents.
  // Batches reference users via currentHolder, so delete batches before users.
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

describe('createContentRun', () => {
  it('creates a ContentRun with targetBatchId=null by default', async () => {
    const run = await createContentRun({ clientId, triggeredById: userId, targetMonth: '2026-05' })
    expect(run.targetBatchId).toBeNull()
  })

  it('creates a ContentRun with the provided targetBatchId', async () => {
    const batch = await db.batch.create({
      data: {
        clientId,
        label: 'May 2026',
        currentStep: 'copy',
        currentHolder: userId,
        currentRole: 'am',
      },
    })
    const run = await createContentRun({
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
      targetBatchId: batch.id,
    })
    expect(run.targetBatchId).toBe(batch.id)
  })
})

describe('findMatchingBatchForRun', () => {
  it('excludes archived batches and returns the live one', async () => {
    // Create an archived batch for the same client+month — this one has a post
    // attached so it would win the tiebreaker if archive exclusion were missing.
    const archived = await db.batch.create({
      data: {
        clientId,
        label: 'May 2026',
        currentStep: 'copy',
        currentHolder: userId,
        currentRole: 'am',
        deletedAt: new Date(),
      },
    })

    // Create the live batch.
    const live = await db.batch.create({
      data: {
        clientId,
        label: 'May 2026',
        currentStep: 'copy',
        currentHolder: userId,
        currentRole: 'am',
      },
    })

    // Attach a post to the archived batch so it would score higher on post
    // count if not excluded.
    const seedRun = await createContentRun({
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
    })
    await db.post.create({
      data: {
        contentRunId: seedRun.id,
        clientId,
        batchId: archived.id,
        postDate: new Date('2026-05-01'),
        caption: 'old post in archived batch',
      },
    })

    // The probe run should match only the live batch.
    const probeRun = await createContentRun({
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
    })
    const match = await findMatchingBatchForRun(probeRun.id)
    expect(match?.id).toBe(live.id)
  })

  it('returns null when only archived batches match', async () => {
    await db.batch.create({
      data: {
        clientId,
        label: 'May 2026',
        currentStep: 'copy',
        currentHolder: userId,
        currentRole: 'am',
        deletedAt: new Date(),
      },
    })

    const probeRun = await createContentRun({
      clientId,
      triggeredById: userId,
      targetMonth: '2026-05',
    })
    const match = await findMatchingBatchForRun(probeRun.id)
    expect(match).toBeNull()
  })
})

describe('findMatchingBatchForClientMonth', () => {
  it('returns null when no batch matches', async () => {
    const match = await findMatchingBatchForClientMonth(clientId, '2026-05')
    expect(match).toBeNull()
  })

  it('returns the matching batch with post count', async () => {
    const batch = await db.batch.create({ data: { clientId, label: 'May 2026', currentStep: 'copy', currentHolder: userId, currentRole: 'am' } })
    const run = await createContentRun({ clientId, triggeredById: userId, targetMonth: '2026-05' })
    await db.post.create({ data: { contentRunId: run.id, clientId, batchId: batch.id, postDate: new Date('2026-05-01'), caption: 'p1' } })
    await db.post.create({ data: { contentRunId: run.id, clientId, batchId: batch.id, postDate: new Date('2026-05-02'), caption: 'p2' } })

    const match = await findMatchingBatchForClientMonth(clientId, '2026-05')
    expect(match).toEqual({ id: batch.id, label: 'May 2026', postCount: 2 })
  })

  it('matches the Client Name Month Year label format (PR #32)', async () => {
    const batch = await db.batch.create({ data: { clientId, label: 'Test Client May 2026', currentStep: 'copy', currentHolder: userId, currentRole: 'am' } })
    const match = await findMatchingBatchForClientMonth(clientId, '2026-05')
    expect(match?.id).toBe(batch.id)
  })

  it('excludes archived batches', async () => {
    await db.batch.create({ data: { clientId, label: 'May 2026', currentStep: 'copy', currentHolder: userId, currentRole: 'am', deletedAt: new Date() } })
    const match = await findMatchingBatchForClientMonth(clientId, '2026-05')
    expect(match).toBeNull()
  })

  it('prefers populated batch over empty when both match', async () => {
    await db.batch.create({ data: { clientId, label: 'Client A May 2026', currentStep: 'copy', currentHolder: userId, currentRole: 'am' } })
    const populated = await db.batch.create({ data: { clientId, label: 'Client B May 2026', currentStep: 'copy', currentHolder: userId, currentRole: 'am' } })
    const run = await createContentRun({ clientId, triggeredById: userId, targetMonth: '2026-05' })
    await db.post.create({ data: { contentRunId: run.id, clientId, batchId: populated.id, postDate: new Date('2026-05-01'), caption: 'p' } })
    const match = await findMatchingBatchForClientMonth(clientId, '2026-05')
    expect(match?.id).toBe(populated.id)
  })
})
