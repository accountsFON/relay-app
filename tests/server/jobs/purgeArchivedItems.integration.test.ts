// @vitest-environment node
/**
 * Integration tests for purgeArchivedItems (runPurgeArchivedItems).
 *
 * These tests hit the real database. Because runPurgeArchivedItems imports the
 * module-level `db` singleton, we use vi.mock (with vi.hoisted) to replace
 * that singleton with a locally-created PrismaClient connected to the test DB.
 *
 * Strategy:
 *   1. Load .env.local via dotenv before creating the Prisma client.
 *   2. Build fixture chains covering each cascade path.
 *   3. Test cases:
 *      a. Client older than 30 days: client + all descendants gone, audit entry written.
 *      b. Standalone batch older than 30 days: batch + its posts gone, audit entry written.
 *      c. Standalone run older than 30 days: run + FK-cascade posts gone, audit entry written.
 *      d. Standalone post older than 30 days: post gone, audit entry written.
 *      e. Items younger than 30 days are NOT purged.
 *      f. Mix: some old, some young — only old items purged.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { cleanupLeakedTestOrgs } from '../../helpers/cleanup-leaked-test-orgs'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// vi.hoisted: runs before vi.mock factories — create the real db here.
// ---------------------------------------------------------------------------
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

// Replace the module-level singleton with our test db.
vi.mock('@/db/client', () => ({ db }))

// Import after vi.mock so the mock is in place.
import { runPurgeArchivedItems } from '@/server/jobs/purgeArchivedItems'

afterAll(async () => {
  await cleanupLeakedTestOrgs(db, 'test-purge-job-org-')
  await pool.end()
})

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Returns `now - days * 86400s` as a Date, useful for setting deletedAt
 * values that are clearly beyond / within the 30-day cutoff.
 */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

// Fixture state reset each test.
let orgId: string
let actorUserId: string

// Keep track of all created resource IDs so afterEach can clean up safely.
let createdClientIds: string[]
let createdBatchIds: string[]
let createdRunIds: string[]
let createdPostIds: string[]

beforeEach(async () => {
  const uid = randomUUID()
  createdClientIds = []
  createdBatchIds = []
  createdRunIds = []
  createdPostIds = []

  const org = await db.organization.create({
    data: { name: `test-purge-job-org-${uid}`, clerkOrgId: `purge-job-${uid}` },
  })
  orgId = org.id

  const user = await db.user.create({
    data: {
      clerkUserId: `purge-job-user-${uid}`,
      organizationId: orgId,
      role: 'admin',
      email: `purgejob-${uid}@test.invalid`,
      name: `PurgeJob Actor ${uid}`,
    },
  })
  actorUserId = user.id
})

afterEach(async () => {
  if (!orgId) return
  // FK-safe teardown: children before parents. Use withArchived() so
  // soft-deleted rows that were NOT yet purged are also cleaned up.
  await db.trashAuditLog.deleteMany({ where: { organizationId: orgId } })
  for (const id of createdClientIds) {
    await db.post.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.contentRun.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.batch.withArchived().deleteMany({ where: { clientId: id } }).catch(() => {})
    await db.client.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  // Clean up any standalone rows not under tracked clients.
  for (const id of createdPostIds) {
    await db.post.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  for (const id of createdRunIds) {
    await db.contentRun.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  for (const id of createdBatchIds) {
    await db.batch.withArchived().deleteMany({ where: { id } }).catch(() => {})
  }
  await db.user.deleteMany({ where: { organizationId: orgId } })
  await db.organization.delete({ where: { id: orgId } }).catch(() => {})
})

// ---------------------------------------------------------------------------
// Helper: create a client with a child batch, run, and posts
// ---------------------------------------------------------------------------
async function createClientFixture(opts: {
  clientDeletedAt?: Date
  batchDeletedAt?: Date
  runDeletedAt?: Date
  postDeletedAt?: Date
  postCount?: number
}) {
  const uid = randomUUID()
  const { postCount = 2 } = opts

  const client = await db.client.create({
    data: { organizationId: orgId, name: `client-${uid}`, postingDays: 'Mon,Wed,Fri' },
  })
  createdClientIds.push(client.id)

  if (opts.clientDeletedAt) {
    await db.client.withArchived().update({
      where: { id: client.id },
      data: { deletedAt: opts.clientDeletedAt, deletedBy: actorUserId },
    })
  }

  const batch = await db.batch.create({
    data: {
      clientId: client.id,
      label: `Batch ${uid}`,
      currentStep: 'copy',
      currentHolder: actorUserId,
      currentRole: 'am',
    },
  })
  createdBatchIds.push(batch.id)

  if (opts.batchDeletedAt) {
    await db.batch.withArchived().update({
      where: { id: batch.id },
      data: { deletedAt: opts.batchDeletedAt, deletedBy: actorUserId },
    })
  }

  const run = await db.contentRun.create({
    data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
  })
  createdRunIds.push(run.id)

  if (opts.runDeletedAt) {
    await db.contentRun.withArchived().update({
      where: { id: run.id },
      data: { deletedAt: opts.runDeletedAt, deletedBy: actorUserId },
    })
  }

  const postIdsLocal: string[] = []
  for (let i = 0; i < postCount; i++) {
    const post = await db.post.create({
      data: {
        contentRunId: run.id,
        clientId: client.id,
        batchId: batch.id,
        postDate: new Date(`2026-05-${10 + i}`),
        caption: `Caption ${i} ${uid}`,
        hashtags: ['#test'],
        mediaUrls: [],
      },
    })
    createdPostIds.push(post.id)
    postIdsLocal.push(post.id)

    if (opts.postDeletedAt) {
      await db.post.withArchived().update({
        where: { id: post.id },
        data: { deletedAt: opts.postDeletedAt, deletedBy: actorUserId },
      })
    }
  }

  return { client, batch, run, postIds: postIdsLocal }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runPurgeArchivedItems — client cascade', () => {
  it('hard-deletes a client older than 30 days and all its descendants via FK cascade', async () => {
    const { client, batch, run, postIds } = await createClientFixture({
      clientDeletedAt: daysAgo(35),
      batchDeletedAt: daysAgo(35),
      runDeletedAt: daysAgo(35),
      postDeletedAt: daysAgo(35),
    })

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)
    expect(result.totals.clients).toBeGreaterThanOrEqual(1)

    // Client gone.
    const goneClient = await db.client.withArchived().findFirst({ where: { id: client.id } })
    expect(goneClient).toBeNull()

    // Batch gone (FK cascade from client).
    const goneBatch = await db.batch.withArchived().findFirst({ where: { id: batch.id } })
    expect(goneBatch).toBeNull()

    // Run gone (FK cascade from client).
    const goneRun = await db.contentRun.withArchived().findFirst({ where: { id: run.id } })
    expect(goneRun).toBeNull()

    // All posts gone (FK cascade from client).
    for (const postId of postIds) {
      const gone = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(gone).toBeNull()
    }

    // Audit entry written for the client with rollup.
    const audit = await db.trashAuditLog.findFirst({
      where: {
        organizationId: orgId,
        entityType: 'client',
        action: 'purge',
        actorUserId: 'system:purgeArchivedItems',
      },
    })
    expect(audit).not.toBeNull()
    expect(audit!.cascadeCount).toBeGreaterThanOrEqual(1)
    const ctx = audit!.parentContext as Record<string, unknown>
    expect(ctx.rollup).toBe(true)
  })
})

describe('runPurgeArchivedItems — batch cascade (manual, Post.batchId is SetNull)', () => {
  it('hard-deletes a standalone archived batch and its posts', async () => {
    // Create a live client (not archived) with an archived batch.
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `live-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    const batch = await db.batch.create({
      data: {
        clientId: client.id,
        label: `OldBatch ${uid}`,
        currentStep: 'copy',
        currentHolder: actorUserId,
        currentRole: 'am',
      },
    })
    createdBatchIds.push(batch.id)

    // Archive the batch 35 days ago.
    const archiveTs = daysAgo(35)
    await db.batch.withArchived().update({
      where: { id: batch.id },
      data: { deletedAt: archiveTs, deletedBy: actorUserId },
    })

    // Create a run to satisfy the required contentRunId FK on Post.
    const run = await db.contentRun.create({
      data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-06', status: 'queued' },
    })
    createdRunIds.push(run.id)

    // Create two posts linked to the batch and archive them at the same time.
    const batchPostIds: string[] = []
    for (let i = 0; i < 2; i++) {
      const post = await db.post.create({
        data: {
          contentRunId: run.id,
          clientId: client.id,
          batchId: batch.id,
          postDate: new Date(`2026-06-${10 + i}`),
          caption: `BatchPost ${i} ${uid}`,
          hashtags: ['#test'],
          mediaUrls: [],
        },
      })
      batchPostIds.push(post.id)
      createdPostIds.push(post.id)
      await db.post.withArchived().update({
        where: { id: post.id },
        data: { deletedAt: archiveTs, deletedBy: actorUserId },
      })
    }

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)
    expect(result.totals.batches).toBeGreaterThanOrEqual(1)

    // Batch gone.
    const goneBatch = await db.batch.withArchived().findFirst({ where: { id: batch.id } })
    expect(goneBatch).toBeNull()

    // Posts gone (manually cascaded by purge job).
    for (const postId of batchPostIds) {
      const gone = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(gone).toBeNull()
    }

    // Audit for batch written.
    const audit = await db.trashAuditLog.findFirst({
      where: {
        organizationId: orgId,
        entityType: 'batch',
        action: 'purge',
        actorUserId: 'system:purgeArchivedItems',
      },
    })
    expect(audit).not.toBeNull()
  })
})

describe('runPurgeArchivedItems — standalone run cascade', () => {
  it('hard-deletes a standalone archived run; FK cascade removes its posts', async () => {
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `live-client-run-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    const run = await db.contentRun.create({
      data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-06', status: 'queued' },
    })
    createdRunIds.push(run.id)

    // Archive run 35 days ago.
    const archiveTs = daysAgo(35)
    await db.contentRun.withArchived().update({
      where: { id: run.id },
      data: { deletedAt: archiveTs, deletedBy: actorUserId },
    })

    // Posts linked only to the run (no batchId).
    const runPostIds: string[] = []
    for (let i = 0; i < 2; i++) {
      const post = await db.post.create({
        data: {
          contentRunId: run.id,
          clientId: client.id,
          postDate: new Date(`2026-06-${10 + i}`),
          caption: `RunPost ${i} ${uid}`,
          hashtags: ['#test'],
          mediaUrls: [],
        },
      })
      runPostIds.push(post.id)
      createdPostIds.push(post.id)
      await db.post.withArchived().update({
        where: { id: post.id },
        data: { deletedAt: archiveTs, deletedBy: actorUserId },
      })
    }

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)
    expect(result.totals.runs).toBeGreaterThanOrEqual(1)

    // Run gone.
    const goneRun = await db.contentRun.withArchived().findFirst({ where: { id: run.id } })
    expect(goneRun).toBeNull()

    // Posts gone (FK cascade from run).
    for (const postId of runPostIds) {
      const gone = await db.post.withArchived().findFirst({ where: { id: postId } })
      expect(gone).toBeNull()
    }

    // Audit for run written.
    const audit = await db.trashAuditLog.findFirst({
      where: {
        organizationId: orgId,
        entityType: 'contentRun',
        action: 'purge',
        actorUserId: 'system:purgeArchivedItems',
      },
    })
    expect(audit).not.toBeNull()
  })
})

describe('runPurgeArchivedItems — standalone post', () => {
  it('hard-deletes a standalone archived post older than 30 days', async () => {
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `live-client-post-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    const run = await db.contentRun.create({
      data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
    })
    createdRunIds.push(run.id)

    const post = await db.post.create({
      data: {
        contentRunId: run.id,
        clientId: client.id,
        postDate: new Date('2026-05-01'),
        caption: `StandalonePost ${uid}`,
        hashtags: [],
        mediaUrls: [],
      },
    })
    createdPostIds.push(post.id)

    await db.post.withArchived().update({
      where: { id: post.id },
      data: { deletedAt: daysAgo(35), deletedBy: actorUserId },
    })

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)
    expect(result.totals.posts).toBeGreaterThanOrEqual(1)

    const gone = await db.post.withArchived().findFirst({ where: { id: post.id } })
    expect(gone).toBeNull()

    const audit = await db.trashAuditLog.findFirst({
      where: {
        organizationId: orgId,
        entityType: 'post',
        action: 'purge',
        actorUserId: 'system:purgeArchivedItems',
      },
    })
    expect(audit).not.toBeNull()
  })
})

describe('runPurgeArchivedItems — items younger than 30 days are NOT purged', () => {
  it('leaves recently archived items intact', async () => {
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `young-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    const run = await db.contentRun.create({
      data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-05', status: 'queued' },
    })
    createdRunIds.push(run.id)

    const post = await db.post.create({
      data: {
        contentRunId: run.id,
        clientId: client.id,
        postDate: new Date('2026-05-01'),
        caption: `YoungPost ${uid}`,
        hashtags: [],
        mediaUrls: [],
      },
    })
    createdPostIds.push(post.id)

    // Archive 5 days ago — well within the 30-day window.
    await db.post.withArchived().update({
      where: { id: post.id },
      data: { deletedAt: daysAgo(5), deletedBy: actorUserId },
    })

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)

    // Young post must still exist.
    const stillThere = await db.post.withArchived().findFirst({ where: { id: post.id } })
    expect(stillThere).not.toBeNull()
  })

  it('does not purge a client archived 29 days ago', async () => {
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `29day-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    await db.client.withArchived().update({
      where: { id: client.id },
      data: { deletedAt: daysAgo(29), deletedBy: actorUserId },
    })

    const result = await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    expect(result.ok).toBe(true)

    // Client must still be there.
    const stillThere = await db.client.withArchived().findFirst({ where: { id: client.id } })
    expect(stillThere).not.toBeNull()
  })
})

describe('runPurgeArchivedItems — mixed age items', () => {
  it('purges only the old items and leaves young ones intact', async () => {
    const uid = randomUUID()

    // Old client (35 days ago) — should be purged.
    const { client: oldClient } = await createClientFixture({
      clientDeletedAt: daysAgo(35),
      batchDeletedAt: daysAgo(35),
      runDeletedAt: daysAgo(35),
      postDeletedAt: daysAgo(35),
    })

    // Young client (10 days ago) — should NOT be purged.
    const youngClient = await db.client.create({
      data: { organizationId: orgId, name: `young-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(youngClient.id)

    await db.client.withArchived().update({
      where: { id: youngClient.id },
      data: { deletedAt: daysAgo(10), deletedBy: actorUserId },
    })

    await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    // Old client gone.
    const goneOld = await db.client.withArchived().findFirst({ where: { id: oldClient.id } })
    expect(goneOld).toBeNull()

    // Young client still present.
    const youngStill = await db.client.withArchived().findFirst({ where: { id: youngClient.id } })
    expect(youngStill).not.toBeNull()
  })
})

describe('runPurgeArchivedItems — audit rollup entries', () => {
  it('writes exactly one audit entry per (org, entityType) pair', async () => {
    // Archive two standalone posts in the same org.
    const uid = randomUUID()
    const client = await db.client.create({
      data: { organizationId: orgId, name: `audit-rollup-client-${uid}`, postingDays: 'Mon,Wed,Fri' },
    })
    createdClientIds.push(client.id)

    const run = await db.contentRun.create({
      data: { clientId: client.id, triggeredById: actorUserId, targetMonth: '2026-06', status: 'queued' },
    })
    createdRunIds.push(run.id)

    for (let i = 0; i < 2; i++) {
      const post = await db.post.create({
        data: {
          contentRunId: run.id,
          clientId: client.id,
          postDate: new Date(`2026-06-${10 + i}`),
          caption: `RollupPost ${i} ${uid}`,
          hashtags: [],
          mediaUrls: [],
        },
      })
      createdPostIds.push(post.id)
      await db.post.withArchived().update({
        where: { id: post.id },
        data: { deletedAt: daysAgo(35), deletedBy: actorUserId },
      })
    }

    await runPurgeArchivedItems({ _testOrganizationIds: [orgId] })

    // There should be exactly one 'post' audit entry for this org
    // (rollup combines both posts into one entry).
    const postAudits = await db.trashAuditLog.findMany({
      where: {
        organizationId: orgId,
        entityType: 'post',
        action: 'purge',
        actorUserId: 'system:purgeArchivedItems',
      },
    })
    expect(postAudits).toHaveLength(1)
    expect(postAudits[0].cascadeCount).toBe(2)
  })
})
