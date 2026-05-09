import type { Prisma, PrismaClient, RelayStep, RelayRole } from '@prisma/client'
import { db } from '@/db/client'

type DbOrTx = PrismaClient | Prisma.TransactionClient

export async function findBatch(id: string) {
  return db.batch.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, organizationId: true } },
      holder: { select: { id: true, name: true, email: true, role: true } },
      checklists: { orderBy: { id: 'asc' } },
      revisionPlan: { include: { items: true } },
    },
  })
}

export async function findBatchSlim(id: string, tx?: DbOrTx) {
  const client = tx ?? db
  return client.batch.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      currentStep: true,
      currentSubState: true,
      currentHolder: true,
      currentRole: true,
    },
  })
}

export async function listBatchesByClient(clientId: string) {
  return db.batch.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    include: {
      holder: { select: { id: true, name: true } },
      _count: { select: { posts: true } },
    },
  })
}

export async function listBatchesByHolder(userId: string) {
  return db.batch.findMany({
    where: { currentHolder: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { posts: true } },
    },
  })
}

/**
 * Stuck Watchlist: batches whose currentStep hasn't progressed in
 * the last `idleHours` (default 48 — spec § Verification step 14).
 * Approximates "stuck" by createdAt of the most recent RelayEvent
 * landing on this step.
 */
export async function listStuckBatches(orgId: string, idleHours = 48) {
  const cutoff = new Date(Date.now() - idleHours * 60 * 60 * 1000)
  return db.batch.findMany({
    where: {
      client: { organizationId: orgId },
      OR: [
        { relayEvents: { none: {} }, createdAt: { lt: cutoff } },
        {
          relayEvents: {
            some: {},
            every: { createdAt: { lt: cutoff } },
          },
        },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      holder: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function listChecklistForBatch(batchId: string) {
  return db.checklistItem.findMany({
    where: { batchId },
    orderBy: { id: 'asc' },
  })
}

export async function createBatch(input: {
  clientId: string
  label: string
  currentStep: RelayStep
  currentSubState?: string | null
  currentHolder: string
  currentRole: RelayRole
}) {
  return db.batch.create({ data: { ...input } })
}

export async function listOnboardingQueue(orgId: string) {
  return db.client.findMany({
    where: { organizationId: orgId, onboardingCompletedAt: null },
    select: {
      id: true,
      name: true,
      assignedAmId: true,
      assignedDesignerId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * All batches for an org. Used by the AM kanban (filter client-side
 * to assignedAmId === userId) and admin dashboards.
 */
export async function listBatchesForOrg(orgId: string) {
  return db.batch.findMany({
    where: { client: { organizationId: orgId } },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          assignedAmId: true,
          assignedDesignerId: true,
        },
      },
      holder: { select: { id: true, name: true, role: true } },
      revisionPlan: {
        include: {
          items: { select: { id: true, status: true, type: true } },
        },
      },
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Pipeline view for a Client-role user (their linked client only).
 * Returns the batches the client should see in their pipeline view.
 */
export async function listClientPipelineBatches(linkedClientId: string) {
  return db.batch.findMany({
    where: {
      clientId: linkedClientId,
      currentStep: {
        in: [
          'sent_to_client',
          'client_decision',
          'in_design',
          'designs_completed',
          'am_review_design',
          'design_revisions',
          'am_qa_pre_client',
          'ready_to_schedule',
          'implementing_revisions',
          'revisions_complete',
          'final_qa_schedule',
          'copy',
        ],
      },
    },
    include: {
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}
