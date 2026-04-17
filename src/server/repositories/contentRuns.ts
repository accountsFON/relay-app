import { db } from '@/db/client'
import { Prisma } from '@prisma/client'

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

export async function listRunsByClient(clientId: string) {
  return db.contentRun.findMany({
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
}

export async function getMonthlyCostSummary(organizationId: string) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const runs = await db.contentRun.findMany({
    where: {
      client: { organizationId },
      status: 'complete',
      completedAt: { gte: startOfMonth },
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
