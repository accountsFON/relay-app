import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  console.log('\n=== USERS ===')
  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      clerkUserId: true,
      platformOwner: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const u of users) {
    console.log(`  ${u.id.slice(0, 8)}  ${u.email.padEnd(35)} platOwner=${u.platformOwner} memberships=${u._count.memberships} clerk=${u.clerkUserId?.slice(0, 16) ?? 'null'}`)
  }

  console.log('\n=== ORGANIZATIONS ===')
  const orgs = await db.organization.findMany({
    select: {
      id: true,
      name: true,
      clerkOrgId: true,
      plan: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const o of orgs) {
    console.log(`  ${o.id.slice(0, 8)}  ${o.name.padEnd(35)} clerk=${o.clerkOrgId.slice(0, 20)} memberships=${o._count.memberships}`)
  }

  console.log('\n=== MEMBERSHIPS ===')
  const memberships = await db.membership.findMany({
    include: {
      user: { select: { email: true } },
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  for (const m of memberships) {
    console.log(`  ${m.id.slice(0, 8)}  ${m.user.email.padEnd(35)} -> ${m.organization.name.padEnd(30)} role=${m.role}`)
  }
}

main().finally(() => db.$disconnect())
