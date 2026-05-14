/**
 * Activity view types — denormalized shapes the activity surfaces consume.
 *
 * Prisma's ActivityEvent has `payload: Json`. The runtime contract for that
 * Json is `ActivityPayload` below, keyed by `kind`. The activity-events repo
 * casts; renderers narrow per kind.
 */
import type { ActivityEvent, ActivityKind, RelayStep } from '@prisma/client'

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
