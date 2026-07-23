/**
 * Cleanup leaked test Organizations from the shared prod/dev Neon DB.
 *
 * Integration test files (tests/server/repositories/*-archive.integration.test.ts,
 * tests/server/jobs/*.integration.test.ts, tests/db/soft-delete-extension.integration.test.ts)
 * create Organizations with names prefixed `test-*` in beforeEach and clean
 * them up in afterEach. When a run is cancelled or a teardown fails partway,
 * those orgs leak, and because dev branches are seeded from the same data the
 * leaks surface in the platform-owner agency dropdown.
 *
 * This script lists every Organization where `name STARTS WITH 'test-'`
 * and (in --confirm mode) deletes them.
 *
 * Why raw SQL. Two things break the "just use the Prisma client" approach:
 *
 *   1. Schema drift. A dev branch can be behind `main` (e.g. missing
 *      `organizations.reviewWindowDays`). `organization.delete()` returns the
 *      full row, so the generated client SELECTs a column the DB lacks and
 *      throws P2022. Raw DELETEs name only the columns we filter on, so they
 *      are immune to drift.
 *
 *   2. FK ordering. Four FKs into `users` are RESTRICT, so every row that
 *      references a user we are about to delete must go first:
 *        - content_runs.triggeredById        → users  [RESTRICT]
 *        - batches.currentHolder              → users  [RESTRICT]
 *        - magic_links.createdBy              → users  [RESTRICT]
 *        - permission_audit_logs.actorUserId  → users  [RESTRICT]
 *      Crucially these must be cleared by *user*, not only by client: a
 *      content_run triggered by an org user can point at a client outside the
 *      org, so a client-scoped delete misses it (this is the bug that made the
 *      old per-client sweep fail with P2003 on content_runs_triggeredById_fkey).
 *      Everything else (clients, memberships, posts, batches' children, ...)
 *      is ON DELETE CASCADE from organizations/clients, so the final
 *      `DELETE FROM organizations` cleans the rest.
 *
 * Deletes run in one transaction for the whole matched set (all-or-nothing);
 * on any failure nothing changes and the script can simply be re-run.
 *
 * Usage:
 *   npx tsx scripts/cleanup-leaked-test-orgs.ts            # dry run (default)
 *   npx tsx scripts/cleanup-leaked-test-orgs.ts --confirm  # actually delete
 *
 * Defensive: only ever deletes orgs whose name starts with `test-`, and
 * refuses the designated prod host (assertNotProdDb). Does NOT touch Clerk
 * (test orgs were never created in Clerk).
 */
import path from 'node:path'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { assertNotProdDb } from '@/lib/db-guardrail'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
assertNotProdDb(process.env.DATABASE_URL ?? '')

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
    // NB: select only drift-safe columns. Do NOT select `*` / the whole model,
    // or a dev branch missing a newer column (e.g. reviewWindowDays) throws.
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

  // Defensive guard: never act on anything that is not a test org.
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

  const orgIds = leakedOrgs.map((o) => o.id)
  const inOrgs = Prisma.sql`IN (${Prisma.join(orgIds)})`
  const usersOfOrgs = Prisma.sql`SELECT id FROM users WHERE "organizationId" ${inOrgs}`
  const clientsOfOrgs = Prisma.sql`SELECT id FROM clients WHERE "organizationId" ${inOrgs}`
  const batchesOfOrgs = Prisma.sql`SELECT id FROM batches WHERE "clientId" IN (${clientsOfOrgs})`

  console.log('\n--- Deleting (raw SQL, FK-safe order, one transaction) ---')

  // Order: clear every RESTRICT reference into `users` (scoped by user, not
  // just by client), then delete the orgs and let CASCADE handle the rest.
  const [contentRuns, magicLinks, batches, permissionAuditLogs, organizations] =
    await db.$transaction([
      db.$executeRaw`DELETE FROM content_runs WHERE "clientId" IN (${clientsOfOrgs}) OR "triggeredById" IN (${usersOfOrgs})`,
      db.$executeRaw`DELETE FROM magic_links WHERE "createdBy" IN (${usersOfOrgs}) OR "batchId" IN (${batchesOfOrgs})`,
      db.$executeRaw`DELETE FROM batches WHERE "clientId" IN (${clientsOfOrgs}) OR "currentHolder" IN (${usersOfOrgs})`,
      db.$executeRaw`DELETE FROM permission_audit_logs WHERE "organizationId" ${inOrgs} OR "actorUserId" IN (${usersOfOrgs})`,
      db.$executeRaw`DELETE FROM organizations WHERE id ${inOrgs}`,
    ])

  console.log(
    `  content_runs=${contentRuns} magic_links=${magicLinks} batches=${batches} ` +
      `permission_audit_logs=${permissionAuditLogs} organizations=${organizations}`,
  )

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
