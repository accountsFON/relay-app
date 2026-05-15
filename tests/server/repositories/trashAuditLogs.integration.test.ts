// @vitest-environment node
/**
 * Integration tests for writeTrashAudit.
 *
 * These tests hit the real database to prove that the helper correctly
 * persists rows to trash_audit_logs, and that it accepts both a plain
 * PrismaClient and a transaction client.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client.
 *   2. Create a throwaway Organization before each test.
 *   3. Call writeTrashAudit with a variety of inputs.
 *   4. Read the row back and assert all fields.
 *   5. Clean up all created rows in afterEach so the DB stays clean.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'
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
import { writeTrashAudit } from '@/server/repositories/trashAuditLogs'

// ---------------------------------------------------------------------------
// DB client lifecycle
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
  await cleanupLeakedTestOrgs(db, 'test-trash-audit-org-')
  await pool.end()
})

// ---------------------------------------------------------------------------
// Test fixture state
// ---------------------------------------------------------------------------

let orgId: string

beforeEach(async () => {
  const uid = randomUUID()
  const org = await db.organization.create({
    data: {
      name: `test-trash-audit-org-${uid}`,
      clerkOrgId: `test-trash-audit-${uid}`,
    },
  })
  orgId = org.id
})

afterEach(async () => {
  if (orgId) {
    await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
    await db.organization.delete({ where: { id: orgId } })
  }
})

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('writeTrashAudit — real DB integration', () => {
  it('writes an entry with all required fields', async () => {
    const entityId = `entity-${randomUUID()}`

    await writeTrashAudit(db, {
      actorUserId: 'user-abc-123',
      organizationId: orgId,
      action: 'archive',
      entityType: 'client',
      entityId,
      parentContext: {},
      cascadeCount: 3,
    })

    const row = await db.trashAuditLog.findFirst({ where: { entityId } })

    expect(row).not.toBeNull()
    expect(row!.organizationId).toBe(orgId)
    expect(row!.actorUserId).toBe('user-abc-123')
    expect(row!.action).toBe('archive')
    expect(row!.entityType).toBe('client')
    expect(row!.entityId).toBe(entityId)
    expect(row!.parentContext).toEqual({})
    expect(row!.cascadeCount).toBe(3)
    expect(row!.createdAt).toBeInstanceOf(Date)
  })

  it('accepts a transaction client (tx)', async () => {
    const entityId = `entity-tx-${randomUUID()}`

    await db.$transaction(async (tx) => {
      await writeTrashAudit(tx, {
        actorUserId: 'user-tx-456',
        organizationId: orgId,
        action: 'purge',
        entityType: 'post',
        entityId,
        parentContext: { batchId: 'batch-001', clientId: 'client-001' },
        cascadeCount: 0,
      })
    })

    // Read back outside the transaction to confirm it was committed.
    const row = await db.trashAuditLog.findFirst({ where: { entityId } })

    expect(row).not.toBeNull()
    expect(row!.actorUserId).toBe('user-tx-456')
    expect(row!.action).toBe('purge')
    expect(row!.entityType).toBe('post')
    expect(row!.parentContext).toEqual({ batchId: 'batch-001', clientId: 'client-001' })
    expect(row!.cascadeCount).toBe(0)
  })
})
