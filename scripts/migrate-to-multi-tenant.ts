/**
 * Phase 9: full multi-tenant migration.
 *
 * Renames the existing 'fon-internal' Organization to ADMARK with its
 * real Clerk Org ID, creates a new empty FON Organization, ensures every
 * existing User has Memberships in BOTH orgs, and sets platformOwner=true
 * on Users matching the RELAY_PLATFORM_OWNERS allow list.
 *
 * Idempotent: safe to run multiple times. Detects partial migration state
 * (e.g., the small backfill-memberships.ts already-ran scenario) and only
 * applies the missing pieces.
 *
 * Usage (from production env, during cutover window):
 *   npm run db:migrate-multi-tenant
 *
 * Pre-requisites (verify before running):
 *   1. Phase 1 schema is live (Membership table, User.platformOwner exist)
 *   2. Clerk dashboard has both orgs created with the IDs below
 *   3. .env / Vercel has RELAY_PLATFORM_OWNERS set with all platform-owner
 *      emails (Julio, Caleb, Mollie)
 *   4. RELAY_MAINTENANCE_MODE=true in Vercel (so the app shows the
 *      maintenance screen during the migration window)
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const FON_CLERK_ORG_ID = 'org_3DPEG3j3fwtlbIxBauaoAZYrYwg'
const ADMARK_CLERK_ORG_ID = 'org_3DPEIMfyCFyNUVMrGGYT9Rn2A2e'
const LEGACY_ORG_CLERK_ID = 'fon-internal'

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function getPlatformOwnerAllowList(): string[] {
  const raw = process.env.RELAY_PLATFORM_OWNERS ?? ''
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

const db = makePrisma()

async function main() {
  console.log('=== Multi-tenant migration ===\n')

  const platformOwners = getPlatformOwnerAllowList()
  if (platformOwners.length === 0) {
    console.warn(
      'WARNING: RELAY_PLATFORM_OWNERS is empty. No users will be granted platformOwner.',
    )
  } else {
    console.log(`Platform owner emails: ${platformOwners.join(', ')}\n`)
  }

  // Step 1: Locate existing org. Could be in two states:
  //   - 'fon-internal' (legacy, not yet renamed by this script)
  //   - ADMARK_CLERK_ORG_ID (already renamed by a previous run)
  let admarkOrg = await db.organization.findUnique({
    where: { clerkOrgId: ADMARK_CLERK_ORG_ID },
  })
  const legacyOrg = await db.organization.findUnique({
    where: { clerkOrgId: LEGACY_ORG_CLERK_ID },
  })

  if (legacyOrg && !admarkOrg) {
    console.log(
      `Found legacy '${LEGACY_ORG_CLERK_ID}' org. Renaming to ADMARK...`,
    )
    admarkOrg = await db.organization.update({
      where: { id: legacyOrg.id },
      data: {
        clerkOrgId: ADMARK_CLERK_ORG_ID,
        name: 'ADMARK',
      },
    })
    console.log(`  Renamed: ${admarkOrg.id} → name='ADMARK', clerkOrgId='${ADMARK_CLERK_ORG_ID}'`)
  } else if (admarkOrg) {
    console.log(`ADMARK org already exists: ${admarkOrg.id}. Skipping rename.`)
  } else {
    throw new Error(
      `Could not find legacy org (clerkOrgId='${LEGACY_ORG_CLERK_ID}') or ADMARK org (clerkOrgId='${ADMARK_CLERK_ORG_ID}'). Aborting.`,
    )
  }

  // Step 2: Find or create FON org
  let fonOrg = await db.organization.findUnique({
    where: { clerkOrgId: FON_CLERK_ORG_ID },
  })
  if (!fonOrg) {
    console.log('\nCreating new FON org...')
    fonOrg = await db.organization.create({
      data: {
        clerkOrgId: FON_CLERK_ORG_ID,
        name: 'Five One Nine Marketing',
        plan: 'agency',
      },
    })
    console.log(`  Created: ${fonOrg.id} → clerkOrgId='${FON_CLERK_ORG_ID}'`)
  } else {
    console.log(`\nFON org already exists: ${fonOrg.id}. Skipping create.`)
  }

  // Step 3: For each User: ensure Memberships in both orgs + set platformOwner
  console.log('\nProcessing users...')
  const users = await db.user.findMany()

  let admarkMembershipsCreated = 0
  let admarkMembershipsSkipped = 0
  let fonMembershipsCreated = 0
  let fonMembershipsSkipped = 0
  let platformOwnersSet = 0

  for (const user of users) {
    // ADMARK Membership: preserve user's existing role + overrides.
    const existingAdmark = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: admarkOrg.id,
        },
      },
    })
    if (existingAdmark) {
      admarkMembershipsSkipped++
    } else {
      await db.membership.create({
        data: {
          userId: user.id,
          organizationId: admarkOrg.id,
          role: user.role,
          permissionOverrides: user.permissionOverrides ?? undefined,
        },
      })
      admarkMembershipsCreated++
    }

    // FON Membership: admin role for everyone (clean slate on FON's floor).
    const existingFon = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: fonOrg.id,
        },
      },
    })
    if (existingFon) {
      fonMembershipsSkipped++
    } else {
      await db.membership.create({
        data: {
          userId: user.id,
          organizationId: fonOrg.id,
          role: 'admin',
        },
      })
      fonMembershipsCreated++
    }

    // Platform owner badge
    const emailLower = user.email.trim().toLowerCase()
    const shouldBeOwner = platformOwners.includes(emailLower)
    if (shouldBeOwner && !user.platformOwner) {
      await db.user.update({
        where: { id: user.id },
        data: { platformOwner: true },
      })
      console.log(`  ${user.email}: platformOwner=true`)
      platformOwnersSet++
    }
  }

  // Step 4: Verify counts
  const totalMemberships = await db.membership.count()
  const expectedMemberships = users.length * 2

  console.log('\n=== Summary ===')
  console.log(`Users: ${users.length}`)
  console.log(`ADMARK memberships created: ${admarkMembershipsCreated} (${admarkMembershipsSkipped} skipped, already existed)`)
  console.log(`FON memberships created: ${fonMembershipsCreated} (${fonMembershipsSkipped} skipped, already existed)`)
  console.log(`Platform owners set: ${platformOwnersSet}`)
  console.log(`Total memberships: ${totalMemberships} (expected ${expectedMemberships})`)

  if (totalMemberships !== expectedMemberships) {
    console.warn(
      `WARNING: Membership count ${totalMemberships} != expected ${expectedMemberships}. Some users may be missing one of the two memberships. Investigate manually.`,
    )
  }

  // Final platform-owner sanity check
  const platformOwnerCount = await db.user.count({
    where: { platformOwner: true },
  })
  console.log(`Users with platformOwner=true: ${platformOwnerCount} (expected ${platformOwners.length} matching the env allow-list)`)

  console.log('\nMigration complete.')
}

main()
  .catch((e) => {
    console.error('\nMigration failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
