// @vitest-environment node
/**
 * Integration tests for the soft-delete Prisma extension.
 *
 * These tests hit the real database to prove that the extension correctly
 * filters rows at the SQL level — not just that it mutates args in isolation.
 *
 * We instantiate a fresh PrismaClient here (rather than importing the shared
 * `db` singleton) because the singleton is created at module load time and
 * picks up whichever DATABASE_URL is in process.env at that moment. Vitest
 * does not expose .env.local vars to process.env by default (Vite exposes
 * them via import.meta.env, not process.env). Loading dotenv here guarantees
 * the correct DATABASE_URL is set before the Pool is created.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client.
 *   2. Create a throwaway Organization + two Client rows before each test.
 *   3. Mark one Client as soft-deleted (deletedAt set, deletedBy set).
 *   4. Assert the four query modes return the correct subset of rows.
 *   5. Clean up all created rows in afterEach so the DB stays clean.
 *
 * Unique UUIDs in names/clerkOrgId ensure concurrent runs don't collide.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../helpers/cleanup-leaked-test-orgs'
import { randomUUID } from 'crypto'
import path from 'path'
import dotenv from 'dotenv'

// Load .env.local BEFORE importing Prisma so DATABASE_URL is populated.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false })
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { applySoftDelete } from '@/db/soft-delete-extension'

// ---------------------------------------------------------------------------
// DB client lifecycle (one pool + client per file, torn down in afterAll)
// ---------------------------------------------------------------------------

let pool: Pool
let db: ReturnType<typeof applySoftDelete>

beforeAll(() => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({ adapter, log: ['error'] })
  db = applySoftDelete(base)
})

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, 'test-soft-delete-org-')
  await pool.end()
})

// ---------------------------------------------------------------------------
// Test fixture state (populated in beforeEach, cleaned in afterEach)
// ---------------------------------------------------------------------------

let orgId: string
let liveClientId: string
let archivedClientId: string

beforeEach(async () => {
  const uid = randomUUID()

  // Create a throwaway organization that owns both test clients.
  const org = await db.organization.create({
    data: {
      name: `test-soft-delete-org-${uid}`,
      clerkOrgId: `test-org-${uid}`,
    },
  })
  orgId = org.id

  // Live client — deletedAt remains null.
  const liveClient = await db.client.create({
    data: {
      organizationId: orgId,
      name: `test-soft-delete-live-${uid}`,
      postingDays: 'Mon',
      holidayHandling: 'Major-US',
      urls: [],
      excludedDates: [],
      status: 'active',
    },
  })
  liveClientId = liveClient.id

  // Archived client — created live, then marked soft-deleted via updateMany.
  // updateMany bypasses the extension's read filters; it only affects the
  // write path, which has no soft-delete gate.
  const archivedClient = await db.client.create({
    data: {
      organizationId: orgId,
      name: `test-soft-delete-archived-${uid}`,
      postingDays: 'Mon',
      holidayHandling: 'Major-US',
      urls: [],
      excludedDates: [],
      status: 'active',
    },
  })
  archivedClientId = archivedClient.id

  await db.client.updateMany({
    where: { id: archivedClientId },
    data: { deletedAt: new Date(), deletedBy: 'test-integration' },
  })
})

afterEach(async () => {
  // Hard-delete both clients then the org to leave no test rows behind.
  // deleteMany tolerates cases where a test already deleted rows.
  if (orgId) {
    await db.client.deleteMany({ where: { organizationId: orgId } })
    await db.organization.delete({ where: { id: orgId } })
  }
})

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('soft-delete extension — real DB integration', () => {
  it('default findMany excludes the archived client and returns only the live one', async () => {
    const rows = await db.client.findMany({
      where: { id: { in: [liveClientId, archivedClientId] } },
    })

    const ids = rows.map((r) => r.id)
    expect(ids).toContain(liveClientId)
    expect(ids).not.toContain(archivedClientId)
  })

  it('withArchived().findMany returns both the live and archived clients', async () => {
    const rows = await (db.client as any).withArchived().findMany({
      where: { id: { in: [liveClientId, archivedClientId] } },
    })

    const ids = rows.map((r: { id: string }) => r.id)
    expect(ids).toContain(liveClientId)
    expect(ids).toContain(archivedClientId)
  })

  it('onlyArchived().findMany returns only the archived client', async () => {
    const rows = await (db.client as any).onlyArchived().findMany({
      where: { id: { in: [liveClientId, archivedClientId] } },
    })

    const ids = rows.map((r: { id: string }) => r.id)
    expect(ids).not.toContain(liveClientId)
    expect(ids).toContain(archivedClientId)
  })

  it('default findUnique returns null for a soft-deleted client', async () => {
    const result = await db.client.findUnique({ where: { id: archivedClientId } })
    expect(result).toBeNull()
  })
})
