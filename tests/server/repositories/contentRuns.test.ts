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
import { createContentRun } from '@/server/repositories/contentRuns'

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
