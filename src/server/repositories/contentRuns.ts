import { db } from '@/db/client'
import { Prisma } from '@prisma/client'
import type { DateScope } from '@/lib/date-scope'
import { dateScopeIncludesMonth } from '@/lib/date-scope'

export async function createContentRun(input: {
  clientId: string
  triggeredById: string
  targetMonth: string
}) {
  return db.contentRun.create({
    data: {
      clientId: input.clientId,
      triggeredById: input.triggeredById,
      targetMonth: input.targetMonth,
      status: 'queued',
    },
  })
}

export async function findContentRun(id: string) {
  return db.contentRun.findUnique({
    where: { id },
    include: { posts: { orderBy: { postDate: 'asc' } } },
  })
}

export async function findExistingRun(clientId: string, targetMonth: string) {
  return db.contentRun.findFirst({
    where: {
      clientId,
      targetMonth,
      status: { in: ['queued', 'running', 'complete'] },
    },
  })
}

export async function listRunsByClient(
  clientId: string,
  opts: { dateScope?: DateScope } = {},
) {
  const runs = await db.contentRun.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      targetMonth: true,
      status: true,
      totalCostUsd: true,
      creditsConsumed: true,
      createdAt: true,
      completedAt: true,
      errorMessage: true,
      _count: { select: { posts: true } },
    },
  })
  if (!opts.dateScope) return runs
  // Runs are month-keyed (targetMonth = "YYYY-MM"), not timestamp-keyed.
  // Filter by month overlap with the scope range per spec edge case.
  return runs.filter((r) => dateScopeIncludesMonth(opts.dateScope!, r.targetMonth))
}

/**
 * Recently failed ContentRuns scoped to an organization. Powers the admin
 * Failed Runs section and any future ops dashboards. Sorted newest first.
 *
 * Uses `createdAt` rather than `completedAt` because failed runs do not set
 * `completedAt`. We treat the run row's createdAt as a "best signal" for
 * recency. If a run failed long after creation (rare, but possible on
 * retries), it still surfaces here in the right order relative to others.
 */
export async function listFailedRunsForOrg(
  organizationId: string,
  opts: { limit?: number } = {},
) {
  return db.contentRun.findMany({
    where: {
      status: 'failed',
      client: { organizationId },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 25,
    select: {
      id: true,
      clientId: true,
      targetMonth: true,
      errorMessage: true,
      totalCostUsd: true,
      creditsConsumed: true,
      createdAt: true,
      startedAt: true,
      client: { select: { id: true, name: true } },
      _count: { select: { posts: true } },
    },
  })
}

export async function getMonthlyCostSummary(
  organizationId: string,
  opts: { dateScope?: DateScope } = {},
) {
  const fallbackStart = new Date()
  fallbackStart.setDate(1)
  fallbackStart.setHours(0, 0, 0, 0)

  const range = opts.dateScope ?? null
  const completedAtFilter: Prisma.DateTimeFilter | undefined =
    range
      ? {
          ...(range.from && { gte: range.from }),
          ...(range.to && { lt: range.to }),
        }
      : { gte: fallbackStart }

  const runs = await db.contentRun.findMany({
    where: {
      client: { organizationId },
      status: 'complete',
      ...(completedAtFilter && { completedAt: completedAtFilter }),
    },
    select: {
      totalCostUsd: true,
      client: { select: { id: true, name: true } },
    },
  })

  const totalCost = runs.reduce(
    (sum, r) => sum + Number(r.totalCostUsd ?? 0),
    0
  )

  const byClient = new Map<string, { name: string; cost: number; runs: number }>()
  for (const run of runs) {
    const entry = byClient.get(run.client.id) ?? {
      name: run.client.name,
      cost: 0,
      runs: 0,
    }
    entry.cost += Number(run.totalCostUsd ?? 0)
    entry.runs += 1
    byClient.set(run.client.id, entry)
  }

  return {
    totalCostUsd: Math.round(totalCost * 10000) / 10000,
    totalRuns: runs.length,
    byClient: Array.from(byClient.values()).sort((a, b) => b.cost - a.cost),
  }
}
