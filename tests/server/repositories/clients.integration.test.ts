// @vitest-environment node
/**
 * Integration tests for createClient + updateClient covering the
 * clientReviewEnabled per-client toggle.
 *
 * Mirrors the seed pattern in clients-archive.integration.test.ts: hoist a
 * real PrismaClient against the .env.local DATABASE_URL, then vi.mock the
 * @/db/client singleton so the repository module under test reaches the
 * real test database.
 */
import { describe, it, expect, vi, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'
import { randomUUID } from 'crypto'

const { db, pool } = await vi.hoisted(async () => {
  const path = await import('path')
  const dotenv = await import('dotenv')
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: false })
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false })

  const { Pool } = await import('pg')
  const { PrismaClient } = await import('@prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { applySoftDelete } = await import('@/db/soft-delete-extension')

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({ adapter, log: ['error'] })
  const db = applySoftDelete(base)
  return { db, pool }
})

vi.mock('@/db/client', () => ({ db }))

import { createClient, updateClient } from '@/server/repositories/clients'

const TEST_ORG_PREFIX = 'test-clients-review-org-'

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, TEST_ORG_PREFIX)
  await pool.end()
})

async function seedOrg(label: string) {
  const uid = randomUUID()
  return db.organization.create({
    data: {
      name: `${TEST_ORG_PREFIX}${label}-${uid}`,
      clerkOrgId: `${TEST_ORG_PREFIX}${label}-${uid}`,
    },
  })
}

describe('createClient + updateClient, clientReviewEnabled', () => {
  it('persists clientReviewEnabled = true when provided', async () => {
    const org = await seedOrg('on')
    const c = await createClient({
      organizationId: org.id,
      name: 'Review On Client',
      postingDays: 'Mon,Wed,Fri',
      urls: [],
      holidayHandling: 'Major-US',
      excludedDates: [],
      status: 'active',
      clientReviewEnabled: true,
    })
    const fetched = await db.client.findUnique({ where: { id: c.id } })
    expect(fetched?.clientReviewEnabled).toBe(true)
  })

  it('defaults clientReviewEnabled to false when omitted', async () => {
    const org = await seedOrg('default')
    const c = await createClient({
      organizationId: org.id,
      name: 'Default Client',
      postingDays: 'Mon,Wed,Fri',
      urls: [],
      holidayHandling: 'Major-US',
      excludedDates: [],
      status: 'active',
    })
    const fetched = await db.client.findUnique({ where: { id: c.id } })
    expect(fetched?.clientReviewEnabled).toBe(false)
  })

  it('updateClient flips clientReviewEnabled', async () => {
    const org = await seedOrg('toggle')
    const c = await createClient({
      organizationId: org.id,
      name: 'Toggle Client',
      postingDays: 'Mon,Wed,Fri',
      urls: [],
      holidayHandling: 'Major-US',
      excludedDates: [],
      status: 'active',
      clientReviewEnabled: false,
    })
    await updateClient(c.id, org.id, { clientReviewEnabled: true })
    const after = await db.client.findUnique({ where: { id: c.id } })
    expect(after?.clientReviewEnabled).toBe(true)
  })
})
