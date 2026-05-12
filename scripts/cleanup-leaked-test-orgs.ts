/**
 * Cleanup leaked test Organizations from the shared prod/dev Neon DB.
 *
 * Integration test files (tests/server/repositories/*-archive.integration.test.ts,
 * tests/server/jobs/*.integration.test.ts, tests/db/soft-delete-extension.integration.test.ts)
 * create Organizations with names prefixed `test-*` in beforeEach and clean
 * them up in afterEach. When a run is cancelled or a teardown fails partway,
 * those orgs leak — and because prod and dev share the same Neon endpoint,
 * the leaks surface in the prod platform-owner agency dropdown.
 *
 * This script lists every Organization where `name STARTS WITH 'test-'`
 * and (in --confirm mode) deletes them.
 *
 * Deletion order matters because several FKs default to RESTRICT (not
 * Cascade): Batch.currentHolder → User, ContentRun.triggeredById → User,
 * Client.assignedAmId/Designer → User, PermissionAuditLog.actorUserId →
 * User, User.linkedClientId → Client. Relying on `Organization.deleteMany`
 * to cascade fails with P2003 because Postgres tries to delete Users before
 * PermissionAuditLogs / ContentRuns / Batches that reference them.
 *
 * The order below mirrors the test's afterEach pattern, scoped to all
 * matched orgs at once, in one transaction per org so a single failure
 * doesn't roll back the whole sweep.
 *
 * Usage:
 *   npx tsx scripts/cleanup-leaked-test-orgs.ts            # dry run (default)
 *   npx tsx scripts/cleanup-leaked-test-orgs.ts --confirm  # actually delete
 *
 * Defensive: refuses to act on any org whose name does not start with
 * `test-`. Does NOT touch Clerk (test orgs were never created in Clerk).
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const TEST_ORG_PREFIX = 'test-'

async function main() {
  const confirm = process.argv.includes('--confirm')
  const mode = confirm ? 'CONFIRM (DESTRUCTIVE)' : 'DRY RUN'

  console.log(`\n--- cleanup-leaked-test-orgs (${mode}) ---`)
  console.log(`Looking for Organizations where name starts with "${TEST_ORG_PREFIX}"\n`)

  const leakedOrgs = await db.organization.findMany({
    where: { name: { startsWith: TEST_ORG_PREFIX } },
    select: {
      id: true,
      name: true,
      clerkOrgId: true,
      createdAt: true,
      _count: {
        select: {
          clients: true,
          users: true,
          memberships: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (leakedOrgs.length === 0) {
    console.log('No leaked test Organizations found. Nothing to do.')
    return
  }

  console.log(`Found ${leakedOrgs.length} leaked test Org(s).`)

  // Defensive guard
  for (const o of leakedOrgs) {
    if (!o.name.startsWith(TEST_ORG_PREFIX)) {
      throw new Error(
        `Defensive abort: query returned an Organization whose name does not start with ${TEST_ORG_PREFIX}: ${o.name}`,
      )
    }
  }

  if (!confirm) {
    console.log('\nDRY RUN: nothing deleted. Re-run with --confirm to actually delete.')
    console.log('\nBreakdown by name prefix:')
    const counts = new Map<string, number>()
    for (const o of leakedOrgs) {
      const prefix = o.name.replace(/-[0-9a-f]{8}-[0-9a-f-]+$/, '')
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    for (const [prefix, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(3)} × ${prefix}`)
    }
    return
  }

  console.log('\n--- Deleting (one org per transaction) ---')
  let succeeded = 0
  let failed = 0
  const failures: { org: string; error: string }[] = []

  for (const org of leakedOrgs) {
    try {
      await db.$transaction(async (tx) => {
        const clients = await tx.client.findMany({
          where: { organizationId: org.id },
          select: { id: true },
        })
        const clientIds = clients.map((c) => c.id)

        // Children of Clients first (Batch/CR/Post). Soft-delete extension does
        // not intercept delete methods, so this clears archived rows too.
        if (clientIds.length > 0) {
          await tx.post.deleteMany({ where: { clientId: { in: clientIds } } })
          await tx.contentRun.deleteMany({ where: { clientId: { in: clientIds } } })
          await tx.batch.deleteMany({ where: { clientId: { in: clientIds } } })
        }

        // Org-scoped audit + permission tables (PAL → User is RESTRICT, must
        // delete before User).
        await tx.trashAuditLog.deleteMany({ where: { organizationId: org.id } })
        await tx.permissionAuditLog.deleteMany({ where: { organizationId: org.id } })
        await tx.membership.deleteMany({ where: { organizationId: org.id } })

        // Users (no remaining references at this point in test data).
        await tx.user.deleteMany({ where: { organizationId: org.id } })

        // Clients (Posts/Batches/CRs already gone; no User.linkedClientId in
        // test fixtures).
        await tx.client.deleteMany({ where: { organizationId: org.id } })

        // Finally the Organization itself.
        await tx.organization.delete({ where: { id: org.id } })
      })
      succeeded++
    } catch (err) {
      failed++
      failures.push({
        org: `${org.id} (${org.name})`,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  console.log(`  deleted ${succeeded} / ${leakedOrgs.length} Organizations`)
  if (failed > 0) {
    console.log(`  ${failed} failure(s):`)
    for (const f of failures.slice(0, 10)) {
      console.log(`    ${f.org}: ${f.error}`)
    }
    if (failures.length > 10) {
      console.log(`    ... and ${failures.length - 10} more`)
    }
  }

  console.log('\n--- Final audit ---')
  const finalOrgs = await db.organization.findMany({
    select: { name: true, _count: { select: { memberships: true } } },
    orderBy: { name: 'asc' },
  })
  console.log(`Remaining Organizations (${finalOrgs.length}):`)
  finalOrgs.forEach((o) =>
    console.log(`  ${o.name}  memberships=${o._count.memberships}`),
  )
}

main()
  .then(() => {
    console.log('\nDone.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('FAILED:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
