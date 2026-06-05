import {
  ActivityKind,
  EventVisibility,
  RelayEventType,
  RelayRole,
  RelayStep,
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
  /**
   * True when the acting user is NOT the current batch holder but is
   * permitted to advance anyway (AM / admin / platformOwner override).
   * Audit-only: the service writes this into the `batch_passed` payload
   * so renderers + notification copy can prefix with "X overrode the
   * holder and ...". Defaults to false.
   */
  wasOverride?: boolean
}

export interface SendBackBatonInput {
  batchId: string
  toStep: RelayStep
  reason: string
  actorId: string
  actorOrganizationId: string
  /** See PassBatonInput.wasOverride. */
  wasOverride?: boolean
}

export interface ForceStepInput {
  batchId: string
  toStep: RelayStep
  reason?: string
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
        `passBaton called with non-forward direction (${result.direction}); use sendBackBaton instead`,
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
          wasOverride: input.wasOverride === true,
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

export interface AdvanceFromClientReviewInput {
  batchId: string
  decision: 'approved' | 'changes'
  reviewerName: string | null
  /** A real org user used as RelayEvent.fromUser and as the holder fallback
   *  when the client has no assigned AM. In practice the magic link creator. */
  fallbackUserId: string
  /** The review session being submitted. Threaded through so a designer
   *  notification (image-pin revisions) can deep link to its detail page. */
  reviewSessionId: string
}

export interface AdvanceFromClientReviewResult {
  advanced: boolean
  toStep?: RelayStep
  newHolderId?: string
  reason?: string
}

/**
 * Advance a relay in response to a client review submission on the magic
 * link. Client attributed: the activity event is recorded with a null actor
 * (the reviewer is not a Clerk user) and the AM/new holder is notified
 * WITHOUT the actor-exclusion that passBaton applies. Best effort: callers
 * wrap this so a failure never rolls back the review submission.
 *
 * Guard: only acts when clientReviewEnabled and the batch is on a client-held
 * step (sent_to_client or client_decision); otherwise a no-op so a second
 * reviewer's submit, or a submit after the AM already moved the batch, is
 * harmless.
 */
export async function advanceFromClientReview(
  input: AdvanceFromClientReviewInput,
): Promise<AdvanceFromClientReviewResult> {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        clientReviewEnabled: true,
        label: true,
      },
    })
    if (!batch) return { advanced: false, reason: 'not_found' }

    const isClientHeld =
      batch.currentStep === RelayStep.sent_to_client ||
      batch.currentStep === RelayStep.client_decision
    if (!batch.clientReviewEnabled || !isClientHeld) {
      return { advanced: false, reason: 'not_at_client_step' }
    }

    // Deliberate single hop: the client review collapses straight to the
    // outcome, skipping the intermediate `client_decision` step (which exists
    // only for the logged-in client persona). We therefore do NOT call
    // validateTransition here; `sent_to_client -> ready_to_schedule` is not a
    // legal edge in the table by design. Do not "fix" this to route through
    // client_decision (approved default confirmed by Julio, 2026-06-04 spec).
    const toStep =
      input.decision === 'approved'
        ? RelayStep.ready_to_schedule
        : RelayStep.implementing_revisions

    const next = await resolveHolderForStep(
      tx,
      batch.clientId,
      toStep,
      input.fallbackUserId,
    )
    const toUserName = await loadUserName(tx, next.userId)

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: toStep,
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
        toStep,
        fromUser: input.fallbackUserId,
        toUser: next.userId,
        reason:
          input.decision === 'approved'
            ? 'client_approved'
            : 'client_requested_changes',
        payload: { reviewerName: input.reviewerName, decision: input.decision },
      },
    })

    await reseedChecklistForStep(tx, batch.id, toStep)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: null,
        kind: ActivityKind.client_review_decided,
        // Always internal: this event is shown to the AM/holder, not to the
        // client reviewer. Deliberately diverges from passBaton's
        // CLIENT_FACING_STEPS visibility (ready_to_schedule is client-facing
        // there); do not "fix" this to match passBaton.
        visibility: EventVisibility.internal,
        payload: {
          kind: 'client_review_decided',
          batchId: batch.id,
          batchLabel: batch.label,
          fromStep: batch.currentStep,
          toStep,
          decision: input.decision,
          reviewerName: input.reviewerName,
          toUserName,
          newHolderId: next.userId,
          newHolderRole: next.role,
        },
        mentionedUserIds: next.notifyUserIds,
      },
      tx,
    )

    if (toStep === RelayStep.implementing_revisions) {
      const clientForDesigner = await tx.client.findUnique({
        where: { id: batch.clientId },
        select: { assignedDesignerId: true },
      })
      const designerId = clientForDesigner?.assignedDesignerId ?? null
      if (designerId) {
        // PostThread has NO pinKind column; an image pin is a thread with
        // imageX set (imageX/imageY = image, captionFrom/captionTo = caption,
        // all null = post-level).
        const openImagePins = await tx.postThread.count({
          where: {
            post: { batchId: batch.id },
            reviewerToken: { not: null },
            status: 'open',
            imageX: { not: null },
          },
        })
        if (openImagePins > 0) {
          await recordActivity(
            {
              clientId: batch.clientId,
              actorId: null,
              kind: ActivityKind.revision_images_requested,
              visibility: EventVisibility.internal,
              payload: {
                kind: 'revision_images_requested',
                batchId: batch.id,
                batchLabel: batch.label,
                reviewSessionId: input.reviewSessionId,
              },
              mentionedUserIds: [designerId],
            },
            tx,
          )
        }
      }
    }

    return { advanced: true, toStep, newHolderId: next.userId }
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
  /**
   * True when the acting user is NOT the current batch holder but is
   * permitted to finish anyway (AM / admin / platformOwner override).
   * Audit-only: written into the `batch_completed` payload so renderers
   * can prefix with "X overrode the holder and finished ...". Defaults
   * to false.
   */
  wasOverride?: boolean
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
        // Anchor for the auto-archive cron (Phase 3 item 21, Wave F6).
        // Set once on the terminal transition; the auto-archive runner
        // reads this column and stamps deletedAt 30 days later.
        completedAt: new Date(),
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
          wasOverride: input.wasOverride === true,
        },
      },
      tx,
    )

    return { batchId: batch.id }
  })
}

/**
 * Admin / platform owner only. Moves a batch from its current step to
 * `toStep`, bypassing the state machine's LEGAL_TRANSITIONS table. Both
 * directions allowed. Permission gate lives at the action layer
 * (relay.forceStep); the service does not check roles.
 *
 * Distinct from passBaton (forward/auto direction gate) and sendBackBaton
 * (send_back direction gate). force step has no direction concept and
 * writes a dedicated RelayEvent type.
 *
 * Side effects: updates step + holder + role; clears completedAt when
 * leaving the completed step (so the auto-archive cron does not re-grab a
 * reopened batch); reseeds the checklist for the destination; inserts a
 * force_step RelayEvent; records a batch_force_stepped ActivityEvent
 * (internal visibility).
 */
export async function forceStep(input: ForceStepInput) {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        currentHolder: true,
        label: true,
        client: { select: { organizationId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }

    if (input.toStep === batch.currentStep) {
      throw new RelayServiceError('No op force step: toStep equals current step')
    }
    if (input.toStep === RelayStep.designs_completed) {
      throw new RelayServiceError(
        'designs_completed is retired and cannot be a force step destination',
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

    const enteringCompleted = input.toStep === RelayStep.completed
    const leavingCompleted = batch.currentStep === RelayStep.completed
    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: input.toStep,
        currentSubState: null,
        currentHolder: next.userId,
        currentRole: next.role,
        ...(enteringCompleted
          ? { completedAt: new Date() }
          : leavingCompleted
            ? { completedAt: null }
            : {}),
      },
    })

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.force_step,
        fromStep: batch.currentStep,
        toStep: input.toStep,
        fromUser: input.actorId,
        toUser: next.userId,
        reason: input.reason ?? null,
      },
    })

    await reseedChecklistForStep(tx, batch.id, input.toStep)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.batch_force_stepped,
        visibility: EventVisibility.internal,
        payload: {
          kind: 'batch_force_stepped',
          batchId: batch.id,
          batchLabel: batch.label,
          fromStep: batch.currentStep,
          toStep: input.toStep,
          fromUserName,
          toUserName,
          newHolderId: next.userId,
          reason: input.reason ?? null,
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
          wasOverride: input.wasOverride === true,
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
