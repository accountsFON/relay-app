/**
 * Demo seed: 31 in-flight batches across all 13 RelayStep values plus 2
 * onboarding-gate batches for the unassigned clients. 3 of the in-flight
 * batches are backdated >48h so the Admin Stuck Watchlist has rows.
 *
 * RevisionPlan + RevisionItems are seeded for batches at design_revisions
 * and implementing_revisions (4 plans, mixed item types and statuses).
 *
 * Checklists are seeded via reseedChecklistForStep, with a deterministic
 * subset partially ticked so the "Pass to" button enable/disable surface
 * is testable.
 */
import type { DbClient } from '@/db/client'
import {
  RelayRole,
  RelayStep,
  RevisionItemStatus,
  RevisionItemType,
} from '@prisma/client'
import {
  holderRoleForStep,
  reseedChecklistForStep,
} from '@/server/lib/relay-state-machine'
import type { SeededClient } from './clients'
import type { SeededContentRun, TargetMonth } from './content-runs'
import type { SeededUserMap } from './users'

interface RevisionItemSpec {
  type: RevisionItemType
  description: string
  status: RevisionItemStatus
  /** 'am' to assign to client AM, 'designer' to assign to client designer. */
  assignTo: 'am' | 'designer'
}

interface BatchSpec {
  clientIdx: number
  month: TargetMonth | null
  step: RelayStep
  /** Optional sub state for steps that surface one (copy: generating/drafted/approved). */
  subState?: string
  /** When true, backdate createdAt > 48h so Admin Stuck Watchlist sees it. */
  stuck?: boolean
  /** Number of seed checklist items to mark checked (deterministic). 0 means none. */
  checkedCount?: number
  /** Revision plan + items, only for design_revisions and implementing_revisions. */
  revisionItems?: RevisionItemSpec[]
}

const BATCH_SPECS: BatchSpec[] = [
  // Cedar Creek Dental (Casey linked) — design_revisions on Mar, sent_to_client on Apr.
  {
    clientIdx: 1,
    month: '2026-03',
    step: RelayStep.design_revisions,
    revisionItems: [
      {
        type: RevisionItemType.copy,
        description: 'Soften the CTA on post 3 — feels too pushy.',
        status: RevisionItemStatus.in_progress,
        assignTo: 'am',
      },
      {
        type: RevisionItemType.design,
        description: 'Recolor the icon row on post 5 to match the cream warm token.',
        status: RevisionItemStatus.pending,
        assignTo: 'designer',
      },
      {
        type: RevisionItemType.am_inline,
        description: 'Reorder posts 7 and 8 to land the offer earlier in the month.',
        status: RevisionItemStatus.complete,
        assignTo: 'am',
      },
    ],
  },
  { clientIdx: 1, month: '2026-04', step: RelayStep.sent_to_client, checkedCount: 1 },

  // Apex Plumbing (Taylor linked) — client_decision Mar, sent_to_client Apr.
  { clientIdx: 2, month: '2026-03', step: RelayStep.client_decision },
  { clientIdx: 2, month: '2026-04', step: RelayStep.sent_to_client },

  // Sunrise Yoga (Dakota linked) — am_qa_pre_client Mar, client_decision Apr.
  { clientIdx: 3, month: '2026-03', step: RelayStep.am_qa_pre_client, checkedCount: 2 },
  { clientIdx: 3, month: '2026-04', step: RelayStep.client_decision },

  // Riverbend Realty — ready_to_schedule Mar, copy (drafted) Apr.
  { clientIdx: 4, month: '2026-03', step: RelayStep.ready_to_schedule, checkedCount: 1 },
  { clientIdx: 4, month: '2026-04', step: RelayStep.copy, subState: 'drafted' },

  // Mainline Auto Repair — implementing_revisions Mar (STUCK), copy (generating) Apr.
  {
    clientIdx: 5,
    month: '2026-03',
    step: RelayStep.implementing_revisions,
    stuck: true,
    revisionItems: [
      {
        type: RevisionItemType.design,
        description: 'New header background on post 2, oil colored gradient.',
        status: RevisionItemStatus.in_progress,
        assignTo: 'designer',
      },
      {
        type: RevisionItemType.design,
        description: 'Replace stock car photo on post 6 with our shop floor.',
        status: RevisionItemStatus.pending,
        assignTo: 'designer',
      },
      {
        type: RevisionItemType.copy,
        description: 'Tighten captions on posts 4 and 5 — too long.',
        status: RevisionItemStatus.complete,
        assignTo: 'am',
      },
    ],
  },
  { clientIdx: 5, month: '2026-04', step: RelayStep.copy, subState: 'generating' },

  // Lighthouse Family Law — final_qa_schedule Mar, in_design Apr.
  { clientIdx: 6, month: '2026-03', step: RelayStep.final_qa_schedule, checkedCount: 2 },
  { clientIdx: 6, month: '2026-04', step: RelayStep.in_design },

  // Hilltop Tax — implementing_revisions Mar (STUCK), copy (approved) Apr.
  {
    clientIdx: 7,
    month: '2026-03',
    step: RelayStep.implementing_revisions,
    stuck: true,
    revisionItems: [
      {
        type: RevisionItemType.copy,
        description: 'Update Q1 dates referenced in post 4 — now stale.',
        status: RevisionItemStatus.in_progress,
        assignTo: 'am',
      },
      {
        type: RevisionItemType.am_inline,
        description: 'Swap order of posts 9 and 10 to lead with deadline reminder.',
        status: RevisionItemStatus.pending,
        assignTo: 'am',
      },
    ],
  },
  { clientIdx: 7, month: '2026-04', step: RelayStep.copy, subState: 'approved' },

  // Greenway Landscaping — revisions_complete Mar, in_design Apr.
  { clientIdx: 8, month: '2026-03', step: RelayStep.revisions_complete, checkedCount: 1 },
  { clientIdx: 8, month: '2026-04', step: RelayStep.in_design },

  // Bread & Bowl — designs_completed Apr only.
  { clientIdx: 9, month: '2026-04', step: RelayStep.designs_completed },

  // Cyclone CrossFit — am_review_design Apr only.
  { clientIdx: 10, month: '2026-04', step: RelayStep.am_review_design, checkedCount: 1 },

  // Northbay Veterinary — ready_to_schedule Mar, copy (drafted) Apr.
  { clientIdx: 11, month: '2026-03', step: RelayStep.ready_to_schedule },
  { clientIdx: 11, month: '2026-04', step: RelayStep.copy, subState: 'drafted' },

  // Stonewall Roofing — designs_completed Apr.
  { clientIdx: 12, month: '2026-04', step: RelayStep.designs_completed },

  // Solstice Photography — revisions_complete Mar, in_design Apr.
  { clientIdx: 13, month: '2026-03', step: RelayStep.revisions_complete, checkedCount: 2 },
  { clientIdx: 13, month: '2026-04', step: RelayStep.in_design },

  // Halcyon HVAC — final_qa_schedule Mar, in_design Apr.
  { clientIdx: 14, month: '2026-03', step: RelayStep.final_qa_schedule, checkedCount: 1 },
  { clientIdx: 14, month: '2026-04', step: RelayStep.in_design },

  // Bright Path Tutoring — am_review_design Apr.
  { clientIdx: 15, month: '2026-04', step: RelayStep.am_review_design },

  // Coastal Bay Salon — design_revisions Apr.
  {
    clientIdx: 16,
    month: '2026-04',
    step: RelayStep.design_revisions,
    revisionItems: [
      {
        type: RevisionItemType.design,
        description: 'New hero crop for post 1, brighter exposure.',
        status: RevisionItemStatus.in_progress,
        assignTo: 'designer',
      },
      {
        type: RevisionItemType.design,
        description: 'Replace stock model on post 4 with team headshot.',
        status: RevisionItemStatus.pending,
        assignTo: 'designer',
      },
      {
        type: RevisionItemType.copy,
        description: 'Soften the lash extension promo language on post 7.',
        status: RevisionItemStatus.pending,
        assignTo: 'am',
      },
      {
        type: RevisionItemType.am_inline,
        description: 'Confirm hours block at end of every post matches the new schedule.',
        status: RevisionItemStatus.complete,
        assignTo: 'am',
      },
    ],
  },

  // Old Mill Brewing (paused) — copy (drafted) Apr STUCK.
  {
    clientIdx: 17,
    month: '2026-04',
    step: RelayStep.copy,
    subState: 'drafted',
    stuck: true,
  },

  // Polaris Wellness (archived) — am_qa_pre_client Mar.
  { clientIdx: 18, month: '2026-03', step: RelayStep.am_qa_pre_client },

  // Ironwood Construction (unassigned) — onboarding_gate.
  { clientIdx: 19, month: null, step: RelayStep.onboarding_gate },

  // Maple & Oak Furnishings (unassigned) — onboarding_gate.
  { clientIdx: 20, month: null, step: RelayStep.onboarding_gate },
]

export interface SeededBatch {
  id: string
  clientId: string
  clientIdx: number
  step: RelayStep
  month: TargetMonth | null
  contentRunId: string | null
  postIds: string[]
}

function clientLabel(month: TargetMonth | null): string {
  return month ?? 'onboarding'
}

function resolveHolderUserId(
  step: RelayStep,
  client: SeededClient,
  org: SeededUserMap,
): string {
  const role = holderRoleForStep(step)
  switch (role) {
    case RelayRole.am:
      return client.amUserId ?? org.users.admin.id
    case RelayRole.designer:
      return client.designerUserId ?? org.users.admin.id
    case RelayRole.client: {
      if (client.idx === 1) return org.users.client1.id
      if (client.idx === 2) return org.users.client2.id
      if (client.idx === 3) return org.users.client3.id
      return org.users.admin.id
    }
    case RelayRole.admin:
    default:
      return org.users.admin.id
  }
}

function resolveAssignee(
  client: SeededClient,
  org: SeededUserMap,
  assignTo: 'am' | 'designer',
): string {
  if (assignTo === 'designer') {
    return client.designerUserId ?? org.users.admin.id
  }
  return client.amUserId ?? org.users.admin.id
}

const STUCK_BACKDATE_DAYS = 5

export async function seedBatches(
  db: DbClient,
  clients: SeededClient[],
  runs: SeededContentRun[],
  org: SeededUserMap,
): Promise<SeededBatch[]> {
  const clientByIdx = new Map(clients.map((c) => [c.idx, c]))
  const runByClientMonth = new Map<string, SeededContentRun>()
  for (const r of runs) {
    runByClientMonth.set(`${r.clientIdx}:${r.targetMonth}`, r)
  }

  const result: SeededBatch[] = []

  for (const spec of BATCH_SPECS) {
    const client = clientByIdx.get(spec.clientIdx)
    if (!client) {
      throw new Error(`Batch spec references missing client idx ${spec.clientIdx}`)
    }
    const run = spec.month
      ? runByClientMonth.get(`${client.idx}:${spec.month}`) ?? null
      : null
    const label = clientLabel(spec.month)
    const role = holderRoleForStep(spec.step)
    const holderUserId = resolveHolderUserId(spec.step, client, org)

    const createdAt = spec.stuck
      ? new Date(Date.now() - STUCK_BACKDATE_DAYS * 24 * 60 * 60 * 1000)
      : undefined

    const existing = await db.batch.findFirst({
      where: { clientId: client.id, label },
      select: { id: true },
    })

    let batchId: string
    if (existing) {
      const updated = await db.batch.update({
        where: { id: existing.id },
        data: {
          currentStep: spec.step,
          currentSubState: spec.subState ?? null,
          currentHolder: holderUserId,
          currentRole: role,
          clientReviewEnabled: client.clientReviewEnabled,
          ...(createdAt ? { createdAt } : {}),
        },
        select: { id: true },
      })
      batchId = updated.id
    } else {
      const created = await db.batch.create({
        data: {
          clientId: client.id,
          label,
          currentStep: spec.step,
          currentSubState: spec.subState ?? null,
          currentHolder: holderUserId,
          currentRole: role,
          clientReviewEnabled: client.clientReviewEnabled,
          ...(createdAt ? { createdAt } : {}),
        },
        select: { id: true },
      })
      batchId = created.id
    }

    if (run) {
      await db.post.updateMany({
        where: { contentRunId: run.id },
        data: { batchId },
      })
    }

    await db.$transaction(async (tx) => {
      await reseedChecklistForStep(tx, batchId, spec.step)
      const checkedCount = spec.checkedCount ?? 0
      if (checkedCount > 0) {
        const items = await tx.checklistItem.findMany({
          where: { batchId },
          orderBy: { id: 'asc' },
          select: { id: true },
        })
        const toCheck = items.slice(0, checkedCount).map((i) => i.id)
        if (toCheck.length > 0) {
          await tx.checklistItem.updateMany({
            where: { id: { in: toCheck } },
            data: {
              checked: true,
              checkedBy: holderUserId,
              checkedAt: new Date(),
            },
          })
        }
      }
    })

    if (spec.revisionItems && spec.revisionItems.length > 0) {
      await db.revisionPlan.deleteMany({ where: { batchId } })
      const plan = await db.revisionPlan.create({
        data: { batchId },
        select: { id: true },
      })
      for (const item of spec.revisionItems) {
        await db.revisionItem.create({
          data: {
            revisionPlanId: plan.id,
            type: item.type,
            description: item.description,
            status: item.status,
            assignedTo: resolveAssignee(client, org, item.assignTo),
            completedAt:
              item.status === RevisionItemStatus.complete ? new Date() : null,
          },
        })
      }
    }

    result.push({
      id: batchId,
      clientId: client.id,
      clientIdx: client.idx,
      step: spec.step,
      month: spec.month,
      contentRunId: run?.id ?? null,
      postIds: run?.postIds ?? [],
    })
  }

  return result
}
