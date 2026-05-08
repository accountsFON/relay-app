/**
 * Backfill Memberships for existing Users.
 *
 * One-off script that mirrors each User's legacy `role` + `permissionOverrides`
 * into a Membership row attached to their `organizationId`. Idempotent: skips
 * any user who already has a Membership in their org.
 *
 * Run once after Phase 1 schema is in place, before Phase 2's getOrgContext
 * rewrite goes live. The bigger Phase 9 migration will rename the existing
 * org to ADMARK; these Memberships travel with it.
 *
 * Usage: npx tsx scripts/backfill-memberships.ts
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const db = makePrisma()

async function main() {
  const users = await db.user.findMany()
  console.log(`Found ${users.length} users.`)

  let created = 0
  let skipped = 0

  for (const user of users) {
    const existing = await db.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: user.organizationId,
        },
      },
    })

    if (existing) {
      console.log(`  skip ${user.email} (membership already exists)`)
      skipped++
      continue
    }

    await db.membership.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
        permissionOverrides: user.permissionOverrides ?? undefined,
      },
    })
    console.log(`  created membership for ${user.email} (role=${user.role})`)
    created++
  }

  console.log(`\nDone. ${created} created, ${skipped} skipped.`)
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
