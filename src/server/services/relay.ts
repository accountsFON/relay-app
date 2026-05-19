import {
  ActivityKind,
  EventVisibility,
  RelayEventType,
  RelayRole,
  RelayStep,
  RevisionItemStatus,
  RevisionItemType,
} from '@prisma/client'
import { db } from '@/db/client'
import type { DbTx } from '@/db/client'
import {
  holderRoleForStep,
  reseedChecklistForStep,
  validateTransition,
} from '@/server/lib/relay-state-machine'
import { recordActivity } from '@/server/services/activity'

/**
 * Steps the client cares about. A pass_forward landing at one of these
 * (or auto-advancing through one) is `public`; everything else internal.
 * Spec § Future Features § Section 2 visibility rules.
 */
const CLIENT_FACING_STEPS = new Set<RelayStep>([
  RelayStep.sent_to_client,
  RelayStep.client_decision,
  RelayStep.ready_to_schedule,
  RelayStep.implementing_revisions,
])

export interface PassBatonInput {
  batchId: string
  toStep: RelayStep
  /** Acting user's DB id. */
  actorId: string
  /**
   * The actor's current organization (DB id). Used to scope the
   * batchId lookup so a caller cannot advance a batch in another org by
   * passing its id. Treat mismatch as "Relay not found" (404 semantics)
   * to avoid existence leaks.
   */
  actorOrganizationId: string
}

export interface SendBackBatonInput {
  batchId: string
  toStep: RelayStep
  reason: string
  actorId: string
  actorOrganizationId: string
}

export interface DispatchRevisionsInput {
  batchId: string
  actorId: string
  actorOrganizationId: string
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
  actorOrganizationId: string
}

export class RelayServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayServiceError'
  }
}

/**
 * Subset of Client fields used to decide who is sitting with a batch at a
 * given step. Exposed so the pure helper `getNotifyTargetsForStep` can be
 * unit-tested without touching Prisma.
 */
export interface NotifyTargetClient {
  assignedAmId: string | null
  assignedDesignerId: string | null
  linkedClientUsers: { id: string }[]
}

/**
 * Return the DB user ids who should be notified when a batch lands at
 * `step`. AM and Designer steps notify the single assigned person; client
 * steps notify every user linked to the client. Returns `[]` when the
 * relevant slot is unassigned so callers can fall back to a single holder
 * id (e.g. the acting admin) without polluting mentions.
 */
export function getNotifyTargetsForStep(
  step: RelayStep,
  client: NotifyTargetClient,
): string[] {
  const role = holderRoleForStep(step)
  switch (role) {
    case RelayRole.am:
      return client.assignedAmId ? [client.assignedAmId] : []
    case RelayRole.designer:
      return client.assignedDesignerId ? [client.assignedDesignerId] : []
    case RelayRole.client:
      return client.linkedClientUsers.map((u) => u.id)
    case RelayRole.admin:
      return []
  }
}

/**
 * Resolve the next holder (DB user id) for a given step on a batch and the
 * full set of user ids to notify. Pulls AM / Designer assignments and
 * linked client users from the Client; falls back to the acting user if
 * the role's primary slot isn't assigned (an admin pushing the batch
 * forward acts as a stand-in until the assignment is filled).
 */
async function resolveHolderForStep(
  tx: DbTx,
  batchClientId: string,
  step: RelayStep,
  fallbackUserId: string,
): Promise<{ userId: string; role: RelayRole; notifyUserIds: string[] }> {
  const role = holderRoleForStep(step)
  const client = await tx.client.findUnique({
    where: { id: batchClientId },
    select: {
      assignedAmId: true,
      assignedDesignerId: true,
      linkedClientUsers: { select: { id: true } },
    },
  })
  if (!client) throw new RelayServiceError('Client not found for relay')

  const notifyUserIds = getNotifyTargetsForStep(step, client)

  switch (role) {
    case RelayRole.am:
      return {
        userId: client.assignedAmId ?? fallbackUserId,
        role,
        notifyUserIds,
      }
    case RelayRole.designer:
      return {
        userId: client.assignedDesignerId ?? fallbackUserId,
        role,
        notifyUserIds,
      }
    case RelayRole.client: {
      const clientUserId = client.linkedClientUsers[0]?.id
      return {
        userId: clientUserId ?? fallbackUserId,
        role,
        notifyUserIds,
      }
    }
    case RelayRole.admin:
      return { userId: fallbackUserId, role, notifyUserIds }
  }
}

/**
 * Filter `targets` down to ids that are not the actor. Prevents a user
 * who advances a batch from being mentioned in their own activity event.
 */
function mentionsExcludingActor(
  targets: string[],
  actorId: string,
): string[] {
  return targets.filter((id) => id !== actorId)
}

async function loadUserName(
  tx: DbTx,
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
        clientReviewEnabled: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    // Cross-tenant scope: a passBaton call for a batch in a different org is
    // treated as "not found" to avoid leaking existence across tenants.
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }

    const result = validateTransition(batch.currentStep, input.toStep, batch.clientReviewEnabled)
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
        visibility: CLIENT_FACING_STEPS.has(input.toStep)
          ? EventVisibility.public
          : EventVisibility.internal,
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
        mentionedUserIds: mentionsExcludingActor(
          next.notifyUserIds,
          input.actorId,
        ),
      },
      tx,
    )

    return { batchId: batch.id, toStep: input.toStep, newHolderId: next.userId }
  })
}

/**
 * Terminal-state transition: advances a batch from final_qa_schedule to
 * completed. Emits batch_completed ActivityEvent with public visibility so
 * clients see "Cedar Creek May 2026 finished by Julio" in their activity
 * thread.
 *
 * Checklist completion is gated at the action layer (matches passBatonAction
 * pattern). The service itself only validates the transition.
 */
export interface FinishBatchInput {
  batchId: string
  actorId: string
  actorOrganizationId: string
}

export async function finishBatch(input: FinishBatchInput) {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        currentHolder: true,
        label: true,
        clientReviewEnabled: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }

    const result = validateTransition(batch.currentStep, RelayStep.completed, batch.clientReviewEnabled)
    if (!result.ok) throw new RelayServiceError(result.reason ?? 'Illegal transition')

    const completedByName = await loadUserName(tx, input.actorId)
    const previousHolder = batch.currentHolder

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: RelayStep.completed,
        currentSubState: null,
        currentHolder: input.actorId,
        currentRole: RelayRole.am,
      },
    })

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.pass_forward,
        fromStep: batch.currentStep,
        toStep: RelayStep.completed,
        fromUser: previousHolder,
        toUser: input.actorId,
      },
    })

    await reseedChecklistForStep(tx, batch.id, RelayStep.completed)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.batch_completed,
        visibility: EventVisibility.public,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          completedByName,
        },
      },
      tx,
    )

    return { batchId: batch.id }
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
        clientReviewEnabled: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    // Cross-tenant scope: see passBaton above.
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }

    const result = validateTransition(batch.currentStep, input.toStep, batch.clientReviewEnabled)
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
        visibility: EventVisibility.internal,
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
        mentionedUserIds: mentionsExcludingActor(
          next.notifyUserIds,
          input.actorId,
        ),
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
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        label: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    // Cross-tenant scope: see passBaton above.
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }
    if (batch.currentStep !== RelayStep.implementing_revisions) {
      throw new RelayServiceError(
        `dispatchRevisions called on relay at step ${batch.currentStep}; must be implementing_revisions`,
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
          visibility: EventVisibility.internal,
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

    // Resolve the batch (and its org) BEFORE the revisionItem.update so a
    // cross-org caller cannot mutate item state before the scope check.
    const batch = await tx.batch.findUnique({
      where: { id: item.plan.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        label: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    // Cross-tenant scope: a revision item whose batch is in another org is
    // treated as "not found" to avoid existence leaks.
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }

    await tx.revisionItem.update({
      where: { id: item.id },
      data: { status: RevisionItemStatus.complete, completedAt: new Date() },
    })

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
        visibility: EventVisibility.internal,
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
          visibility: EventVisibility.internal,
          payload: {
            batchId: batch.id,
            batchLabel: batch.label,
            step: RelayStep.revisions_complete,
            fromSubState: 'in progress',
            toSubState: 'all revisions complete',
          },
          mentionedUserIds: mentionsExcludingActor(
            next.notifyUserIds,
            input.actorId,
          ),
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
