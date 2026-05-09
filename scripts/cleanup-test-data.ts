/**
 * One-off cleanup of test data accumulated during the multi-tenant
 * tightening session (2026-05-08). Deletes:
 *
 *   - 3 stale julio@fiveonenine.us Users (prior local-dev signups)
 *   - 2 julygerman@gmail.com Users (broken-state test invitee + dup)
 *   - 2 calebcody116@gmail.com Users (test signups)
 *   - "Acme Farming" Org (ghost from broken Path 1 test)
 *   - "Calebs Agency" Org (ghost from broken Path 1 test)
 *   - All Memberships referencing the above
 *   - Clerk-side users + Clerk-side orgs
 *
 * Keeps:
 *   - accounts@fonmarketing.com (Julio, platformOwner)
 *   - caleb@fonmarketing.com (Caleb, platformOwner)
 *   - ADMARK + Five One Nine Marketing Orgs and their real Memberships
 *
 * Idempotent: safe to re-run. Deletes happen in a transaction.
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { createClerkClient } from '@clerk/backend'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

const ORPHAN_EMAILS = [
  'julio@fiveonenine.us',
  'julygerman@gmail.com',
  'calebcody116@gmail.com',
]
const GHOST_ORG_NAMES = ['Acme Farming', 'Calebs Agency']

async function main() {
  console.log('\n--- Identifying orphan rows ---')

  const orphanUsers = await db.user.findMany({
    where: { email: { in: ORPHAN_EMAILS } },
    select: { id: true, email: true, clerkUserId: true },
  })
  console.log(`Found ${orphanUsers.length} orphan User rows`)
  orphanUsers.forEach((u) =>
    console.log(`  ${u.id}  ${u.email}  clerk=${u.clerkUserId}`),
  )

  const ghostOrgs = await db.organization.findMany({
    where: { name: { in: GHOST_ORG_NAMES } },
    select: { id: true, name: true, clerkOrgId: true },
  })
  console.log(`\nFound ${ghostOrgs.length} ghost Org rows`)
  ghostOrgs.forEach((o) =>
    console.log(`  ${o.id}  ${o.name}  clerk=${o.clerkOrgId}`),
  )

  const orphanUserIds = orphanUsers.map((u) => u.id)
  const ghostOrgIds = ghostOrgs.map((o) => o.id)
  const orphanClerkUserIds = orphanUsers
    .map((u) => u.clerkUserId)
    .filter((id): id is string => Boolean(id))
  const ghostClerkOrgIds = ghostOrgs.map((o) => o.clerkOrgId)

  console.log('\n--- DB cleanup (transactional) ---')
  const result = await db.$transaction(async (tx) => {
    const memberships1 = await tx.membership.deleteMany({
      where: { userId: { in: orphanUserIds } },
    })
    const memberships2 = await tx.membership.deleteMany({
      where: { organizationId: { in: ghostOrgIds } },
    })
    const users = await tx.user.deleteMany({
      where: { id: { in: orphanUserIds } },
    })
    const orgs = await tx.organization.deleteMany({
      where: { id: { in: ghostOrgIds } },
    })
    return {
      memberships: memberships1.count + memberships2.count,
      users: users.count,
      orgs: orgs.count,
    }
  })
  console.log(
    `  deleted: ${result.memberships} Memberships, ${result.users} Users, ${result.orgs} Orgs`,
  )

  console.log('\n--- Clerk-side cleanup ---')
  for (const clerkUserId of orphanClerkUserIds) {
    try {
      await clerk.users.deleteUser(clerkUserId)
      console.log(`  deleted Clerk user ${clerkUserId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  skipped Clerk user ${clerkUserId}: ${msg}`)
    }
  }
  for (const clerkOrgId of ghostClerkOrgIds) {
    try {
      await clerk.organizations.deleteOrganization(clerkOrgId)
      console.log(`  deleted Clerk org ${clerkOrgId}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  skipped Clerk org ${clerkOrgId}: ${msg}`)
    }
  }

  console.log('\n--- Final audit ---')
  const finalUsers = await db.user.findMany({
    select: { email: true, platformOwner: true },
    orderBy: { email: 'asc' },
  })
  console.log(`Users (${finalUsers.length}):`)
  finalUsers.forEach((u) =>
    console.log(`  ${u.email}  platOwner=${u.platformOwner}`),
  )

  const finalOrgs = await db.organization.findMany({
    select: { name: true, _count: { select: { memberships: true } } },
    orderBy: { name: 'asc' },
  })
  console.log(`\nOrganizations (${finalOrgs.length}):`)
  finalOrgs.forEach((o) =>
    console.log(`  ${o.name}  memberships=${o._count.memberships}`),
  )

  const finalMemberships = await db.membership.count()
  console.log(`\nTotal Memberships: ${finalMemberships}`)
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
