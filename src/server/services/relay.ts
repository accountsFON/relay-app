import type { Prisma } from '@prisma/client'
import {
  ActivityKind,
  RelayEventType,
  RelayRole,
  RelayStep,
  RevisionItemStatus,
  RevisionItemType,
} from '@prisma/client'
import { db } from '@/db/client'
import {
  holderRoleForStep,
  reseedChecklistForStep,
  validateTransition,
} from '@/server/lib/relay-state-machine'
import { recordActivity } from '@/server/services/activity'

export interface PassBatonInput {
  batchId: string
  toStep: RelayStep
  /** Acting user's DB id. */
  actorId: string
}

export interface SendBackBatonInput {
  batchId: string
  toStep: RelayStep
  reason: string
  actorId: string
}

export interface DispatchRevisionsInput {
  batchId: string
  actorId: string
  items: {
    type: RevisionItemType
    description: string
    /** DB User id of assignee. AM for copy/am_inline, designer for design. */
    assignedTo: string
  }[]
}

export interface CompleteRevisionItemInput {
  itemId: string
  actorId: string
}

export class RelayServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayServiceError'
  }
}

/**
 * Resolve the next holder (DB user id) for a given step on a batch.
 * Pulls AM / Designer assignments from the Client; falls back to the
 * acting user if the role isn't assigned (an admin pushing the batch
 * forward acts as a stand-in until the assignment is filled).
 */
async function resolveHolderForStep(
  tx: Prisma.TransactionClient,
  batchClientId: string,
  step: RelayStep,
  fallbackUserId: string,
): Promise<{ userId: string; role: RelayRole }> {
  const role = holderRoleForStep(step)
  const client = await tx.client.findUnique({
    where: { id: batchClientId },
    select: {
      assignedAmId: true,
      assignedDesignerId: true,
      linkedClientUsers: { select: { id: true }, take: 1 },
    },
  })
  if (!client) throw new RelayServiceError('Client not found for batch')

  switch (role) {
    case RelayRole.am:
      return { userId: client.assignedAmId ?? fallbackUserId, role }
    case RelayRole.designer:
      return { userId: client.assignedDesignerId ?? fallbackUserId, role }
    case RelayRole.client: {
      const clientUserId = client.linkedClientUsers[0]?.id
      return { userId: clientUserId ?? fallbackUserId, role }
    }
    case RelayRole.admin:
      return { userId: fallbackUserId, role }
  }
}

async function loadUserName(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })
  return user?.name ?? 'Unknown'
}

export async function passBaton(input: PassBatonInput) {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        currentHolder: true,
        label: true,
      },
    })
    if (!batch) throw new RelayServiceError('Batch not found')

    const result = validateTransition(batch.currentStep, input.toStep)
    if (!result.ok) throw new RelayServiceError(result.reason ?? 'Illegal transition')
    if (result.direction !== 'forward' && result.direction !== 'auto') {
      throw new RelayServiceError(
        `passBaton called with non-forward direction (${result.direction}); use sendBackBaton or dispatchRevisions instead`,
      )
    }

    const next = await resolveHolderForStep(
      tx,
      batch.clientId,
      input.toStep,
      input.actorId,
    )
    const [fromUserName, toUserName] = await Promise.all([
      loadUserName(tx, input.actorId),
      loadUserName(tx, next.userId),
    ])

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: input.toStep,
        currentSubState: null,
        currentHolder: next.userId,
        currentRole: next.role,
      },
    })

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.pass_forward,
        fromStep: batch.currentStep,
        toStep: input.toStep,
        fromUser: input.actorId,
        toUser: next.userId,
      },
    })

    await reseedChecklistForStep(tx, batch.id, input.toStep)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.batch_passed,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          fromStep: batch.currentStep,
          toStep: input.toStep,
          fromUserName,
          toUserName,
          newHolderId: next.userId,
          newHolderRole: next.role,
        },
        mentionedUserIds: next.userId !== input.actorId ? [next.userId] : [],
      },
      tx,
    )

    return { batchId: batch.id, toStep: input.toStep, newHolderId: next.userId }
  })
}

export async function sendBackBaton(input: SendBackBatonInput) {
  if (!input.reason || input.reason.trim().length === 0) {
    throw new RelayServiceError('Send-back requires a reason note')
  }

  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        currentHolder: true,
        label: true,
      },
    })
    if (!batch) throw new RelayServiceError('Batch not found')

    const result = validateTransition(batch.currentStep, input.toStep)
    if (!result.ok) throw new RelayServiceError(result.reason ?? 'Illegal transition')
    if (result.direction !== 'send_back') {
      throw new RelayServiceError(
        `sendBackBaton called with non-send_back direction (${result.direction})`,
      )
    }

    const next = await resolveHolderForStep(
      tx,
      batch.clientId,
      input.toStep,
      input.actorId,
    )
    const [fromUserName, toUserName] = await Promise.all([
      loadUserName(tx, input.actorId),
      loadUserName(tx, next.userId),
    ])

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: input.toStep,
        currentSubState: null,
        currentHolder: next.userId,
        currentRole: next.role,
      },
    })

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.send_back,
        fromStep: batch.currentStep,
        toStep: input.toStep,
        fromUser: input.actorId,
        toUser: next.userId,
        reason: input.reason,
      },
    })

    await reseedChecklistForStep(tx, batch.id, input.toStep)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.batch_sent_back,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          fromStep: batch.currentStep,
          toStep: input.toStep,
          fromUserName,
          toUserName,
          reason: input.reason,
          newHolderId: next.userId,
        },
        mentionedUserIds: next.userId !== input.actorId ? [next.userId] : [],
      },
      tx,
    )

    return { batchId: batch.id, toStep: input.toStep, newHolderId: next.userId }
  })
}

export async function dispatchRevisions(input: DispatchRevisionsInput) {
  if (input.items.length === 0) {
    throw new RelayServiceError('Revision plan must include at least one item')
  }

  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: { id: true, clientId: true, currentStep: true, label: true },
    })
    if (!batch) throw new RelayServiceError('Batch not found')
    if (batch.currentStep !== RelayStep.implementing_revisions) {
      throw new RelayServiceError(
        `dispatchRevisions called on batch at step ${batch.currentStep}; must be implementing_revisions`,
      )
    }

    await tx.revisionPlan.deleteMany({ where: { batchId: batch.id } })
    const plan = await tx.revisionPlan.create({
      data: {
        batchId: batch.id,
        items: {
          create: input.items.map((item) => ({
            type: item.type,
            description: item.description,
            assignedTo: item.assignedTo,
            status: RevisionItemStatus.pending,
          })),
        },
      },
      include: { items: true },
    })

    for (const item of plan.items) {
      const targetStep = mapRevisionTypeToStep(item.type)
      const assignedToName = await loadUserName(tx, item.assignedTo)
      await tx.relayEvent.create({
        data: {
          batchId: batch.id,
          type: RelayEventType.revision_dispatched,
          fromStep: RelayStep.implementing_revisions,
          toStep: targetStep,
          fromUser: input.actorId,
          toUser: item.assignedTo,
          payload: {
            itemId: item.id,
            type: item.type,
            description: item.description,
          },
        },
      })

      await recordActivity(
        {
          clientId: batch.clientId,
          actorId: input.actorId,
          kind: ActivityKind.batch_revision_dispatched,
          payload: {
            batchId: batch.id,
            batchLabel: batch.label,
            itemId: item.id,
            itemType: item.type,
            itemDescription: item.description,
            assignedToName,
            assignedTo: item.assignedTo,
          },
          mentionedUserIds:
            item.assignedTo !== input.actorId ? [item.assignedTo] : [],
        },
        tx,
      )
    }

    return { batchId: batch.id, planId: plan.id, itemCount: plan.items.length }
  })
}

export async function completeRevisionItem(input: CompleteRevisionItemInput) {
  return db.$transaction(async (tx) => {
    const item = await tx.revisionItem.findUnique({
      where: { id: input.itemId },
      include: { plan: { select: { batchId: true } } },
    })
    if (!item) throw new RelayServiceError('Revision item not found')
    if (item.status === RevisionItemStatus.complete) {
      return { itemId: item.id, alreadyComplete: true, autoAdvanced: false }
    }

    await tx.revisionItem.update({
      where: { id: item.id },
      data: { status: RevisionItemStatus.complete, completedAt: new Date() },
    })

    const batch = await tx.batch.findUnique({
      where: { id: item.plan.batchId },
      select: { id: true, clientId: true, currentStep: true, label: true },
    })
    if (!batch) throw new RelayServiceError('Batch not found')

    const completedByName = await loadUserName(tx, input.actorId)

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.revision_completed,
        fromStep: mapRevisionTypeToStep(item.type),
        toStep: RelayStep.implementing_revisions,
        fromUser: input.actorId,
        toUser: input.actorId,
        payload: { itemId: item.id, type: item.type },
      },
    })

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.batch_revision_completed,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          itemId: item.id,
          itemType: item.type,
          itemDescription: item.description,
          completedByName,
        },
      },
      tx,
    )

    const remaining = await tx.revisionItem.count({
      where: {
        plan: { batchId: batch.id },
        status: { not: RevisionItemStatus.complete },
      },
    })

    if (remaining === 0) {
      const next = await resolveHolderForStep(
        tx,
        batch.clientId,
        RelayStep.revisions_complete,
        input.actorId,
      )
      await tx.batch.update({
        where: { id: batch.id },
        data: {
          currentStep: RelayStep.revisions_complete,
          currentSubState: null,
          currentHolder: next.userId,
          currentRole: next.role,
        },
      })
      await reseedChecklistForStep(tx, batch.id, RelayStep.revisions_complete)
      await recordActivity(
        {
          clientId: batch.clientId,
          actorId: input.actorId,
          kind: ActivityKind.batch_step_advanced,
          payload: {
            batchId: batch.id,
            batchLabel: batch.label,
            step: RelayStep.revisions_complete,
            fromSubState: 'in progress',
            toSubState: 'all revisions complete',
          },
        },
        tx,
      )
      return { itemId: item.id, alreadyComplete: false, autoAdvanced: true }
    }

    return { itemId: item.id, alreadyComplete: false, autoAdvanced: false }
  })
}

function mapRevisionTypeToStep(type: RevisionItemType): RelayStep {
  switch (type) {
    case RevisionItemType.copy:
      return RelayStep.copy
    case RevisionItemType.design:
      return RelayStep.design_revisions
    case RevisionItemType.am_inline:
      return RelayStep.implementing_revisions
  }
}
