/**
 * Seed-resolved IDs for the audit. Loaded once during global setup and cached
 * on disk at .auth/seed-data.json so per-spec helpers can read it synchronously
 * without each spec opening its own Prisma connection.
 *
 * IDs are looked up by stable seed keys (email, client name, batch label +
 * step) rather than hardcoded. If the seed reseats, this re-resolves on next
 * `npm run e2e:setup`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

loadEnv({ path: '.env.local' })

const SEED_DATA_PATH = path.join(process.cwd(), '.auth', 'seed-data.json')
const DEMO_ORG_NAME = 'Relay Demo Agency'
const DEMO_CLIENT_DENTAL = 'Cedar Creek Dental'
const DEMO_CLIENT_PLUMBING = 'Apex Plumbing & Drain'
const DEMO_CLIENT_YOGA = 'Sunrise Yoga Studio'
const DEMO_CLIENT_NO_REVIEW = 'Lighthouse Family Law'

export interface SeedData {
  org: { id: string; clerkOrgId: string }
  users: {
    admin: SeedUser
    am1: SeedUser
    am2: SeedUser
    designer1: SeedUser
    designer2: SeedUser
    client1: SeedUser
    client2: SeedUser
    client3: SeedUser
    platform: SeedUser
  }
  clients: {
    cedarCreekDental: SeedClient
    apexPlumbing: SeedClient
    sunriseYoga: SeedClient
    ironwood: SeedClient
    mapleAndOak: SeedClient
    /** Demo client with clientReviewEnabled = false. Exercised by the no review smoke. */
    lighthouseFamilyLaw: SeedClient
  }
  /** One representative batch ID per RelayStep, picked by `currentStep`. */
  batchByStep: Record<string, string | null>
  /** Three stuck batch IDs (createdAt > 48h, currentStep != complete). */
  stuckBatchIds: string[]
  /** Three posts known to have PostVersions (Cedar Creek, Apex, Riverbend). */
  postsWithVersions: { clientName: string; postId: string; runId: string }[]
  /**
   * A live, non terminal batch on the no review client. Used by the no
   * review Playwright smoke to verify the gated UI (9 track nodes, no
   * Send review link button) without hardcoding a batch ID.
   */
  noReviewBatchId: string | null
}

export interface SeedUser {
  id: string
  email: string
  clerkUserId: string | null
  name: string
}

export interface SeedClient {
  id: string
  name: string
  assignedAmId: string | null
  assignedDesignerId: string | null
}

const RELAY_STEPS = [
  'onboarding_gate',
  'copy',
  'in_design',
  // `designs_completed` removed per Phase 3 item 15 PR1.
  'am_review_design',
  'design_revisions',
  'am_qa_pre_client',
  'sent_to_client',
  'client_decision',
  'ready_to_schedule',
  'implementing_revisions',
  'revisions_complete',
  'final_qa_schedule',
] as const

let cached: SeedData | null = null

function makeClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')
  const pool = new Pool({ connectionString: url })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter, log: ['error'] })
}

export async function resolveSeedData(): Promise<SeedData> {
  if (cached) return cached

  const db = makeClient()
  try {
    const org = await db.organization.findFirst({ where: { name: DEMO_ORG_NAME } })
    if (!org) throw new Error(`Demo org "${DEMO_ORG_NAME}" not found. Run npm run seed:demo first.`)

    const userRows = await db.user.findMany({
      where: { organizationId: org.id },
      select: { id: true, email: true, clerkUserId: true, name: true, role: true, platformOwner: true },
    })
    const userByEmail = (email: string): SeedUser => {
      const u = userRows.find((u) => u.email === email)
      if (!u) throw new Error(`Demo user ${email} not found`)
      return { id: u.id, email: u.email, clerkUserId: u.clerkUserId, name: u.name }
    }

    const clientRows = await db.client.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true, assignedAmId: true, assignedDesignerId: true },
    })
    const clientByName = (name: string): SeedClient => {
      const c = clientRows.find((c) => c.name === name)
      if (!c) throw new Error(`Demo client "${name}" not found`)
      return c
    }

    const batchByStep: Record<string, string | null> = {}
    for (const step of RELAY_STEPS) {
      const b = await db.batch.findFirst({
        where: { client: { organizationId: org.id }, currentStep: step as never },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      batchByStep[step] = b?.id ?? null
    }

    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const stuckRows = await db.batch.findMany({
      where: {
        client: { organizationId: org.id },
        createdAt: { lt: fortyEightHoursAgo },
        currentStep: { notIn: ['ready_to_schedule', 'final_qa_schedule'] as never[] },
      },
      orderBy: { createdAt: 'asc' },
      take: 3,
      select: { id: true },
    })

    const postVersionRows = await db.postVersion.findMany({
      where: { post: { client: { organizationId: org.id } } },
      distinct: ['postId'],
      select: {
        postId: true,
        post: {
          select: {
            id: true,
            contentRunId: true,
            client: { select: { name: true } },
          },
        },
      },
      take: 3,
    })

    // Pick a live, mid flow no review batch for the Playwright smoke. The
    // seed pins Lighthouse Family Law's Apr batch to in_design, which is
    // step 3 of the 9 step no review track.
    const noReviewBatch = await db.batch.findFirst({
      where: {
        clientReviewEnabled: false,
        client: { organizationId: org.id, name: DEMO_CLIENT_NO_REVIEW },
        currentStep: 'in_design' as never,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    cached = {
      org: { id: org.id, clerkOrgId: org.clerkOrgId },
      users: {
        admin: userByEmail('alex.admin@relaydemo.app'),
        am1: userByEmail('morgan.am@relaydemo.app'),
        am2: userByEmail('sam.am@relaydemo.app'),
        designer1: userByEmail('riley.designer@relaydemo.app'),
        designer2: userByEmail('jordan.designer@relaydemo.app'),
        client1: userByEmail('casey.client@relaydemo.app'),
        client2: userByEmail('taylor.client@relaydemo.app'),
        client3: userByEmail('dakota.client@relaydemo.app'),
        platform: userByEmail('pat.platform@relaydemo.app'),
      },
      clients: {
        cedarCreekDental: clientByName(DEMO_CLIENT_DENTAL),
        apexPlumbing: clientByName(DEMO_CLIENT_PLUMBING),
        sunriseYoga: clientByName(DEMO_CLIENT_YOGA),
        ironwood: clientByName('Ironwood Construction'),
        mapleAndOak: clientByName('Maple & Oak Furnishings'),
        lighthouseFamilyLaw: clientByName(DEMO_CLIENT_NO_REVIEW),
      },
      batchByStep,
      stuckBatchIds: stuckRows.map((r) => r.id),
      postsWithVersions: postVersionRows.map((r) => ({
        clientName: r.post.client.name,
        postId: r.post.id,
        runId: r.post.contentRunId,
      })),
      noReviewBatchId: noReviewBatch?.id ?? null,
    }

    fs.mkdirSync(path.dirname(SEED_DATA_PATH), { recursive: true })
    fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(cached, null, 2))
    return cached
  } finally {
    await db.$disconnect()
  }
}

export function readSeedData(): SeedData {
  if (cached) return cached
  if (!fs.existsSync(SEED_DATA_PATH)) {
    throw new Error(
      `Seed data not yet resolved at ${SEED_DATA_PATH}. Run npm run e2e:setup first.`,
    )
  }
  cached = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf-8')) as SeedData
  return cached
}
