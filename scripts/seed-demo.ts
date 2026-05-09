/**
 * Demo seed entry point.
 *
 * Usage:
 *   npm run seed:demo                  # idempotent upsert, safe to re run
 *   npm run seed:demo -- --clean       # delete the demo org first, then re seed
 *   npm run seed:demo -- --skip-clerk  # skip Clerk side, DB only
 *   npm run seed:demo -- --verify      # only run the verification block
 *
 * Refuses unless DEMO_SEED_ALLOW=true is set in env. Refuses if a
 * production-flagged email shows up in the demo org name (defensive).
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import {
  CLERK_DEMO_ORG_NAME,
  deleteClerkOrg,
  deleteClerkUser,
  findClerkOrgByName,
  findClerkUserByEmail,
  makeClerkClient,
  type ClerkClient,
} from './seed/clerk'
import { seedUsers, linkClientUsers, DEMO_USERS } from './seed/users'
import { seedClients, CLIENT_DEFS } from './seed/clients'
import { seedContentRuns } from './seed/content-runs'
import { seedBatches } from './seed/batches'
import { seedActivity } from './seed/activity'
import { seedPostVersions } from './seed/post-versions'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

interface CliFlags {
  clean: boolean
  skipClerk: boolean
  verifyOnly: boolean
}

function parseFlags(argv: string[]): CliFlags {
  return {
    clean: argv.includes('--clean'),
    skipClerk: argv.includes('--skip-clerk'),
    verifyOnly: argv.includes('--verify'),
  }
}

function makeDb(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const PRODUCTION_EMAIL_DOMAINS = [
  '@fonmarketing.com',
  '@admarkok.com',
  '@fiveonenine.us',
]

function assertSafeToRun(): void {
  if (process.env.DEMO_SEED_ALLOW !== 'true') {
    throw new Error(
      'DEMO_SEED_ALLOW is not "true". Refusing to run the demo seed.',
    )
  }
  for (const u of DEMO_USERS) {
    for (const dom of PRODUCTION_EMAIL_DOMAINS) {
      if (u.email.toLowerCase().endsWith(dom)) {
        throw new Error(
          `Demo user ${u.email} uses a production-flagged domain ${dom}. Refusing.`,
        )
      }
    }
  }
  if (
    PRODUCTION_EMAIL_DOMAINS.some((d) =>
      CLERK_DEMO_ORG_NAME.toLowerCase().includes(d),
    )
  ) {
    throw new Error('Demo org name contains a production-flagged domain. Refusing.')
  }
}

async function cleanDemoData(
  db: PrismaClient,
  clerk: ClerkClient | null,
): Promise<void> {
  console.log('--- --clean: tearing down existing Relay Demo Agency ---')

  const org = await db.organization.findFirst({
    where: { name: CLERK_DEMO_ORG_NAME },
    select: { id: true, clerkOrgId: true },
  })

  if (org) {
    const users = await db.user.findMany({
      where: { organizationId: org.id },
      select: { id: true, clerkUserId: true, email: true },
    })

    await db.client.deleteMany({ where: { organizationId: org.id } })
    await db.membership.deleteMany({ where: { organizationId: org.id } })
    await db.user.deleteMany({ where: { organizationId: org.id } })
    await db.organization.delete({ where: { id: org.id } })

    if (clerk) {
      for (const u of users) {
        if (u.clerkUserId) await deleteClerkUser(clerk, u.clerkUserId)
      }
      if (org.clerkOrgId) await deleteClerkOrg(clerk, org.clerkOrgId)
    }
    console.log(
      `  removed ${users.length} users, ${org.clerkOrgId ? '1 clerk org' : 'no clerk org'}`,
    )
  } else {
    console.log('  no DB org found; checking Clerk side for orphans')
    if (clerk) {
      const orphan = await findClerkOrgByName(clerk, CLERK_DEMO_ORG_NAME)
      if (orphan) await deleteClerkOrg(clerk, orphan.id)
      for (const u of DEMO_USERS) {
        const found = await findClerkUserByEmail(clerk, u.email)
        if (found) await deleteClerkUser(clerk, found.id)
      }
    }
  }
  console.log('--- clean complete ---\n')
}

interface VerifyTarget {
  label: string
  actual: number
  min: number
  max: number
}

async function runVerification(db: PrismaClient): Promise<{
  ok: boolean
  rows: VerifyTarget[]
}> {
  const org = await db.organization.findFirst({
    where: { name: CLERK_DEMO_ORG_NAME },
    select: { id: true },
  })
  if (!org) {
    return {
      ok: false,
      rows: [
        { label: 'Org "Relay Demo Agency"', actual: 0, min: 1, max: 1 },
      ],
    }
  }

  const orgId = org.id
  const clientIds = (
    await db.client.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    })
  ).map((c) => c.id)

  const userCount = await db.user.count({ where: { organizationId: orgId } })
  const membershipCount = await db.membership.count({ where: { organizationId: orgId } })
  const clientCount = await db.client.count({ where: { organizationId: orgId } })
  const runCount = await db.contentRun.count({ where: { clientId: { in: clientIds } } })
  const postCount = await db.post.count({ where: { clientId: { in: clientIds } } })
  const batchCount = await db.batch.count({ where: { clientId: { in: clientIds } } })

  const distinctSteps = (
    await db.batch.findMany({
      where: { clientId: { in: clientIds } },
      select: { currentStep: true },
      distinct: ['currentStep'],
    })
  ).length

  const stuckCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const stuckBatchCount = await db.batch.count({
    where: {
      clientId: { in: clientIds },
      createdAt: { lt: stuckCutoff },
    },
  })

  const activityCount = await db.activityEvent.count({ where: { clientId: { in: clientIds } } })
  const mentionCount = await db.mention.count({
    where: { event: { clientId: { in: clientIds } } },
  })
  const versionCount = await db.postVersion.count({
    where: { post: { clientId: { in: clientIds } } },
  })

  const rows: VerifyTarget[] = [
    { label: 'Demo users in org', actual: userCount, min: 9, max: 9 },
    { label: 'Memberships in demo org', actual: membershipCount, min: 9, max: 9 },
    { label: 'Clients', actual: clientCount, min: 20, max: 20 },
    { label: 'ContentRuns', actual: runCount, min: 54, max: 54 },
    { label: 'Posts', actual: postCount, min: 540, max: 540 },
    { label: 'Batches', actual: batchCount, min: 31, max: 31 },
    { label: 'Distinct RelayStep values', actual: distinctSteps, min: 13, max: 13 },
    { label: 'Stuck batches (>48h)', actual: stuckBatchCount, min: 3, max: 3 },
    { label: 'ActivityEvents', actual: activityCount, min: 150, max: 320 },
    { label: 'Mentions', actual: mentionCount, min: 9, max: 9 },
    { label: 'PostVersions', actual: versionCount, min: 55, max: 80 },
  ]

  const ok = rows.every((r) => r.actual >= r.min && r.actual <= r.max)
  return { ok, rows }
}

function printVerification(rows: VerifyTarget[], ok: boolean): void {
  console.log('\n--- Verification ---')
  for (const r of rows) {
    const inRange = r.actual >= r.min && r.actual <= r.max
    const marker = inRange ? 'ok' : 'FAIL'
    const range = r.min === r.max ? `${r.min}` : `${r.min} to ${r.max}`
    console.log(`  [${marker}] ${r.label.padEnd(35)} ${r.actual} (expected ${range})`)
  }
  console.log(`\nOverall: ${ok ? 'PASS' : 'FAIL'}`)
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  assertSafeToRun()

  const db = makeDb()
  const clerk = flags.skipClerk ? null : makeClerkClient()

  try {
    if (flags.verifyOnly) {
      const { ok, rows } = await runVerification(db)
      printVerification(rows, ok)
      process.exit(ok ? 0 : 1)
    }

    if (flags.clean) {
      await cleanDemoData(db, clerk)
    }

    console.log(`Sanity: client roster = ${CLIENT_DEFS.length} clients\n`)

    console.log('--- Step 1: users + org ---')
    const userMap = await seedUsers(db, clerk, { skipClerk: flags.skipClerk })
    console.log(`  org id = ${userMap.organizationId}`)
    console.log(`  ${Object.keys(userMap.users).length} users seeded`)

    console.log('--- Step 2: clients ---')
    const clients = await seedClients(db, userMap)
    console.log(`  ${clients.length} clients`)

    const cedarCreek = clients.find((c) => c.idx === 1)!
    const apex = clients.find((c) => c.idx === 2)!
    const sunrise = clients.find((c) => c.idx === 3)!
    await linkClientUsers(db, userMap.users, {
      client1: cedarCreek.id,
      client2: apex.id,
      client3: sunrise.id,
    })
    console.log('  linked client-role users to their clients')

    console.log('--- Step 3: content runs + posts ---')
    const runs = await seedContentRuns(db, clients, userMap)
    console.log(`  ${runs.length} runs seeded`)

    console.log('--- Step 4: batches + checklists + revision plans ---')
    const batches = await seedBatches(db, clients, runs, userMap)
    console.log(`  ${batches.length} batches seeded`)

    console.log('--- Step 5: activity events + mentions ---')
    const activity = await seedActivity(db, clients, runs, batches, userMap)
    console.log(
      `  ${activity.totalEvents} events, ${activity.totalMentions} mentions`,
    )

    console.log('--- Step 6: post versions ---')
    const versions = await seedPostVersions(db, clients, runs, userMap)
    console.log(
      `  ${versions.totalRows} versions across ${versions.postsTouched} posts`,
    )

    const { ok, rows } = await runVerification(db)
    printVerification(rows, ok)
    if (!ok) {
      console.error('\nVerification failed. Investigate the rows marked FAIL.')
      process.exit(1)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error('seed-demo failed:', err)
  process.exit(1)
})
