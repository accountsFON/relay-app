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
 *
 * Pipeline rework: collapsed sent_to_client + client_decision → client_review,
 * and ready_to_schedule → scheduling (scheduling is AM-held, not client-facing,
 * but implementing_revisions is still surfaced to the client activity feed).
 */
const CLIENT_FACING_STEPS = new Set<RelayStep>([
  RelayStep.client_review,
  RelayStep.scheduling,
  RelayStep.implementing_revisions,
])

/** Window-start stamp for the auto-advance cron: set when entering
 *  client_review, cleared when leaving it. */
function clientReviewStamp(toStep: RelayStep): { clientReviewStartedAt: Date | null } {
  return { clientReviewStartedAt: toStep === RelayStep.client_review ? new Date() : null }
}

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

export interface RequestDesignChangesInput {
  batchId: string
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
        ...clientReviewStamp(input.toStep),
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

    await reseedChecklistForStep(tx, batch.id, input.toStep, batch.clientReviewEnabled)

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
 * Guard: only acts when clientReviewEnabled and the batch is on the merged
 * client-held step (client_review); otherwise a no-op so a second reviewer's
 * submit, or a submit after the AM already moved the batch, is harmless.
 *
 * Pipeline rework: the old sent_to_client + client_decision steps collapsed
 * into the single client_review step; the old ready_to_schedule destination
 * collapsed into scheduling. This function deliberately bypasses
 * validateTransition by design — client_review -> scheduling is an `auto`
 * edge, not a `forward` edge, so passBaton would reject it. Do not "fix"
 * this to route through validateTransition (approved default confirmed by
 * Julio, 2026-06-04 spec; scheduling destination confirmed 2026-06-22 rework).
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

    const isClientHeld = batch.currentStep === RelayStep.client_review
    if (!batch.clientReviewEnabled || !isClientHeld) {
      return { advanced: false, reason: 'not_at_client_step' }
    }

    const toStep =
      input.decision === 'approved'
        ? RelayStep.scheduling
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
        ...clientReviewStamp(toStep),
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

    await reseedChecklistForStep(tx, batch.id, toStep, batch.clientReviewEnabled)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: null,
        kind: ActivityKind.client_review_decided,
        // Always internal: this event is shown to the AM/holder, not to the
        // client reviewer. Deliberately diverges from passBaton's
        // CLIENT_FACING_STEPS visibility (scheduling is client-facing
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

export interface AdvanceFromDesignReviewInput {
  batchId: string
  /** 'approved' = every post approved -> advance to QA; 'changes' = any
   *  non-approval -> requestDesignChanges (no step change). */
  decision: 'approved' | 'changes'
  /** Acting AM's DB id. RelayEvent.fromUser + holder fallback + activity actor. */
  actorUserId: string
  /** The acting AM's organization (DB id), forwarded to requestDesignChanges
   *  for its cross-tenant scope guard. */
  actorOrganizationId: string
  /** The internal review session being submitted. Carried into the payloads. */
  reviewSessionId: string
}

export interface AdvanceFromDesignReviewResult {
  advanced: boolean
  toStep?: RelayStep
  newHolderId?: string
  /** Set on the 'changes' path: requestDesignChanges flipped the sub-state. */
  subState?: 'awaiting_design_revisions'
  reason?: string
}

/**
 * Internal analog of `advanceFromClientReview` for the AM<->designer Design
 * Review. Fired when the AM submits the internal review session. AM attributed:
 * the activity event carries a REAL actorId (the AM is a Clerk user), unlike
 * the client path's null actor. Best effort: callers wrap this so a failure
 * never rolls back the review submission.
 *
 * Guard: only acts when the batch is on the AM-held Design Review step
 * (`am_review_design`); otherwise a no-op so a re-submit, or a submit after the
 * AM already moved the batch, is harmless (mirrors advanceFromClientReview's
 * client_review guard).
 *
 * Routing:
 *   - approved (every post approved) -> advance am_review_design ->
 *     am_qa_pre_client (QA). This IS a `forward` edge in the state machine, but
 *     we update directly within the transaction to mirror advanceFromClientReview
 *     (single attributed write + relay event + checklist reseed + activity).
 *   - changes (any changes_requested/caption_edited) -> reuse the existing
 *     `requestDesignChanges` primitive (sets currentSubState =
 *     'awaiting_design_revisions', notifies the designer, NO step change).
 */
export async function advanceFromDesignReview(
  input: AdvanceFromDesignReviewInput,
): Promise<AdvanceFromDesignReviewResult> {
  // Guard read outside the transaction so the changes path can delegate to
  // requestDesignChanges (which owns its own transaction).
  const guard = await db.batch.findUnique({
    where: { id: input.batchId },
    select: { id: true, currentStep: true },
  })
  if (!guard) return { advanced: false, reason: 'not_found' }
  if (guard.currentStep !== RelayStep.am_review_design) {
    return { advanced: false, reason: 'not_at_design_review' }
  }

  if (input.decision === 'changes') {
    const changed = await requestDesignChanges({
      batchId: input.batchId,
      actorId: input.actorUserId,
      actorOrganizationId: input.actorOrganizationId,
    })
    return { advanced: false, subState: changed.subState }
  }

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
    // Re-check inside the transaction in case the batch moved between the guard
    // read and here.
    if (batch.currentStep !== RelayStep.am_review_design) {
      return { advanced: false, reason: 'not_at_design_review' }
    }

    const toStep = RelayStep.am_qa_pre_client

    const next = await resolveHolderForStep(
      tx,
      batch.clientId,
      toStep,
      input.actorUserId,
    )
    const toUserName = await loadUserName(tx, next.userId)

    await tx.batch.update({
      where: { id: batch.id },
      data: {
        currentStep: toStep,
        currentSubState: null,
        currentHolder: next.userId,
        currentRole: next.role,
        ...clientReviewStamp(toStep),
      },
    })

    await tx.relayEvent.create({
      data: {
        batchId: batch.id,
        type: RelayEventType.pass_forward,
        fromStep: batch.currentStep,
        toStep,
        fromUser: input.actorUserId,
        toUser: next.userId,
        reason: 'internal_review_approved',
        payload: { reviewSessionId: input.reviewSessionId, decision: input.decision },
      },
    })

    await reseedChecklistForStep(tx, batch.id, toStep, batch.clientReviewEnabled)

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorUserId,
        kind: ActivityKind.batch_passed,
        // Internal step (QA), not client-facing.
        visibility: EventVisibility.internal,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          fromStep: batch.currentStep,
          toStep,
          toUserName,
          newHolderId: next.userId,
          newHolderRole: next.role,
          surface: 'internal_review',
          reviewSessionId: input.reviewSessionId,
        },
        mentionedUserIds: mentionsExcludingActor(
          next.notifyUserIds,
          input.actorUserId,
        ),
      },
      tx,
    )

    return { advanced: true, toStep, newHolderId: next.userId }
  })
}

/**
 * Terminal-state transition: advances a batch from scheduling to
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
        clientReviewStartedAt: null,
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

    await reseedChecklistForStep(tx, batch.id, RelayStep.completed, batch.clientReviewEnabled)

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
        clientReviewEnabled: true,
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
        ...clientReviewStamp(input.toStep),
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

    await reseedChecklistForStep(tx, batch.id, input.toStep, batch.clientReviewEnabled)

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
        ...clientReviewStamp(input.toStep),
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

    await reseedChecklistForStep(tx, batch.id, input.toStep, batch.clientReviewEnabled)

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

/**
 * Merge design steps (2026-06-26): "Request changes" on Design Review.
 *
 * This is an IN-STEP action, not a state-machine transition. The batch stays
 * at `am_review_design`, AM-held; we only set `currentSubState =
 * 'awaiting_design_revisions'` (board shows "Awaiting design revisions") and
 * notify the assigned designer with a deep-link to the internal review page.
 * The AM later re-reviews and either requests more changes or passes to QA.
 *
 * - Guard: batch must be at `am_review_design`. The AM / admin role gate lives
 *   at the action layer (mirrors sendBackBaton).
 * - No required note (unlike send-back).
 * - The `design_changes_requested` activity write never blocks: `recordActivity`
 *   swallows its own errors. If no designer is assigned the mention list is
 *   empty but the sub-state still flips.
 */
export async function requestDesignChanges(input: RequestDesignChangesInput) {
  return db.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: input.batchId },
      select: {
        id: true,
        clientId: true,
        currentStep: true,
        label: true,
        client: { select: { organizationId: true, assignedDesignerId: true } },
      },
    })
    if (!batch) throw new RelayServiceError('Relay not found')
    // Cross-tenant scope: see passBaton above.
    if (batch.client.organizationId !== input.actorOrganizationId) {
      throw new RelayServiceError('Relay not found')
    }
    if (batch.currentStep !== RelayStep.am_review_design) {
      throw new RelayServiceError(
        'Request changes is only valid at Design Review',
      )
    }

    const designerId = batch.client.assignedDesignerId

    await tx.batch.update({
      where: { id: batch.id },
      data: { currentSubState: 'awaiting_design_revisions' },
    })

    await recordActivity(
      {
        clientId: batch.clientId,
        actorId: input.actorId,
        kind: ActivityKind.design_changes_requested,
        visibility: EventVisibility.internal,
        payload: {
          batchId: batch.id,
          batchLabel: batch.label,
          surface: 'internal_review',
        },
        mentionedUserIds: designerId
          ? mentionsExcludingActor([designerId], input.actorId)
          : [],
      },
      tx,
    )

    return { batchId: batch.id, subState: 'awaiting_design_revisions' as const }
  })
}
