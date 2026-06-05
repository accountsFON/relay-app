/**
 * Activity view types: denormalized shapes the activity surfaces consume.
 *
 * Prisma's ActivityEvent has `payload: Json`. The runtime contract for that
 * Json is `ActivityPayload` below, keyed by `kind`. The activity-events repo
 * casts; renderers narrow per kind.
 */
import type { ActivityEvent, ActivityKind, RelayRole, RelayStep } from '@prisma/client'

export interface ActivityActor {
  id: string
  name: string
  avatarUrl?: string | null
}

/**
 * Per-kind payload contract for the modeled kinds. Loose now, will tighten
 * with Zod once Rails ships the canonical schemas in src/lib/schemas/activity.ts.
 *
 * Unmodeled kinds (run_*, post_*, member_*, client_*) have payloads that the
 * renderer ignores for now (Phase 6 in the activity-thread plan instruments
 * each one). Their payload type at runtime is whatever Rails wrote; we treat
 * it as `Record<string, unknown>` for the unmodeled branch.
 */
export type ModeledActivityPayload =
  | { kind: 'comment'; body: string; mentionedUserIds: string[] }
  | {
      kind: 'batch_passed'
      batchId: string
      batchLabel: string
      fromStep: RelayStep
      toStep: RelayStep
      fromUserName: string
      toUserName: string
      /**
       * True when the actor was NOT the holder at the time of pass but was
       * permitted to advance anyway (AM / admin / platformOwner override).
       * Optional for back-compat with historical events written before the
       * override flag existed; treat absent as false.
       */
      wasOverride?: boolean
    }
  | {
      kind: 'batch_sent_back'
      batchId: string
      batchLabel: string
      fromStep: RelayStep
      toStep: RelayStep
      fromUserName: string
      toUserName: string
      reason: string
      /** See `batch_passed.wasOverride`. */
      wasOverride?: boolean
    }
  | {
      kind: 'batch_revision_dispatched'
      batchId: string
      batchLabel: string
      itemId: string
      itemType: 'copy' | 'design' | 'am_inline'
      itemDescription: string
      assignedToName: string
    }
  | {
      kind: 'batch_revision_completed'
      batchId: string
      batchLabel: string
      itemId: string
      itemType: 'copy' | 'design' | 'am_inline'
      itemDescription: string
      completedByName: string
    }
  | {
      kind: 'batch_step_advanced'
      batchId: string
      batchLabel: string
      step: RelayStep
      fromSubState: string
      toSubState: string
    }
  | {
      kind: 'batch_completed'
      batchId: string
      batchLabel: string
      completedByName: string
      /** See `batch_passed.wasOverride`. */
      wasOverride?: boolean
    }
  | {
      kind: 'batch_force_stepped'
      batchId: string
      batchLabel: string
      fromStep: RelayStep
      toStep: RelayStep
      fromUserName: string
      toUserName: string
      newHolderId?: string
      reason: string | null
    }
  | {
      kind: 'post_thread_opened'
      threadId: string
      postId: string
      /** Where the thread was pinned. Matches PinLocation['kind']. */
      pinLocation: 'post' | 'image' | 'caption'
    }
  | {
      kind: 'post_thread_resolved'
      threadId: string
      postId: string
      resolvedReason: string | null
    }
  | {
      kind: 'post_caption_ai_fixed'
      postId: string
      threadId: string
      oldCaption: string
      newCaption: string
      postVersionId: string
    }
  | {
      kind: 'magic_link_created'
      magicLinkId: string
      batchId: string
      recipientName: string
      /** ISO string from the server; consumers parse to Date for formatting. */
      expiresAt: string
    }
  | {
      kind: 'magic_link_visited'
      magicLinkId: string
      reviewerName: string
      isFirstVisit: boolean
    }
  | {
      kind: 'review_session_started'
      reviewSessionId: string
      reviewerId: string | null
      round: number
    }
  | {
      kind: 'review_session_submitted'
      reviewSessionId: string
      summary: {
        approved: number
        changesRequested: number
        captionEdited: number
        totalPosts: number
      }
      round: number
    }
  | {
      kind: 'review_caption_edit_accepted'
      postId: string
      reviewItemId: string
      oldCaption: string
      newCaption: string
      postVersionId: string
    }
  | {
      kind: 'review_item_addressed'
      postId: string
      reviewItemId: string
      decision: 'changes_requested' | 'caption_edited'
      /** userId of the AM who addressed the item. */
      addressedBy: string
    }
  | {
      kind: 'review_item_unaddressed'
      postId: string
      reviewItemId: string | null
      /** true when this also un-accepted a caption edit (caption reverted). */
      unaccepted: boolean
      pinsReopened: number
    }
  | {
      kind: 'review_round_started'
      magicLinkId: string
      round: number
    }
  | {
      kind: 'client_review_decided'
      batchId: string
      batchLabel: string
      fromStep: RelayStep
      toStep: RelayStep
      decision: 'approved' | 'changes'
      reviewerName: string | null
      toUserName: string
      newHolderId: string
      newHolderRole: RelayRole
    }

type ModeledKind = ModeledActivityPayload['kind']
type UnmodeledKind = Exclude<ActivityKind, ModeledKind>

export type ActivityPayload =
  | ModeledActivityPayload
  | ({ kind: UnmodeledKind } & Record<string, unknown>)

/**
 * Renderer-friendly view of an ActivityEvent. The repo loads actor and
 * applies the typed payload narrowing. Other relations (run, post) are
 * left as ids to keep the read query cheap; the renderer doesn't need them.
 */
export interface ActivityEventView
  extends Pick<ActivityEvent, 'id' | 'clientId' | 'runId' | 'postId' | 'kind' | 'createdAt'> {
  actor: ActivityActor | null
  payload: ActivityPayload
  /** Mention belonging to the *current viewer* on this event, when loaded. */
  myMention?: { id: string; readAt: Date | null } | null
}

export interface MentionInboxRow {
  mentionId: string
  readAt: Date | null
  event: ActivityEventView
  client: { id: string; name: string }
}
