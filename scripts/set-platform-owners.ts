/**
 * Sets User.platformOwner = true for any user whose email matches an entry
 * in RELAY_PLATFORM_OWNERS. Idempotent. Safe to run any time after Phase 1
 * schema is live.
 *
 * Use this when:
 *   - You added a new platform owner email to the env var and want their
 *     flag set without running the full Phase 9 migration
 *   - You want to verify platform-owner state without touching anything else
 *
 * Usage: npx tsx scripts/set-platform-owners.ts
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
  const allowList = (process.env.RELAY_PLATFORM_OWNERS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (allowList.length === 0) {
    console.warn('RELAY_PLATFORM_OWNERS env var is empty. Nothing to do.')
    return
  }

  console.log(`Allow-list: ${allowList.join(', ')}\n`)

  const users = await db.user.findMany()
  let setCount = 0
  let alreadyCount = 0
  let unmatchedCount = 0

  for (const user of users) {
    const emailLower = user.email.trim().toLowerCase()
    const shouldBeOwner = allowList.includes(emailLower)

    if (shouldBeOwner) {
      if (user.platformOwner) {
        console.log(`  ${user.email}: already platformOwner=true`)
        alreadyCount++
      } else {
        await db.user.update({
          where: { id: user.id },
          data: { platformOwner: true },
        })
        console.log(`  ${user.email}: SET platformOwner=true`)
        setCount++
      }
    } else {
      unmatchedCount++
    }
  }

  console.log(
    `\nDone. ${setCount} set, ${alreadyCount} already true, ${unmatchedCount} not on allow-list.`,
  )

  // Sanity check
  const totalPlatformOwners = await db.user.count({
    where: { platformOwner: true },
  })
  console.log(`Total users with platformOwner=true: ${totalPlatformOwners}`)
}

main()
  .catch((e) => {
    console.error('Failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
