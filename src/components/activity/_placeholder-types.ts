/**
 * Local placeholder types for the activity surface.
 *
 * Mirrors the spec at projects/relay-app/2026-05-09-relay-workflow-design.md
 * § Data Model and projects/relay-app/2026-05-09-activity-thread-plan.md.
 *
 * When Rails Phase 0 lands, delete this file and replace imports with
 * `import type { ActivityEvent, ActivityKind, Mention } from '@prisma/client'`.
 */

import type { RelayStep } from '../relay/_placeholder-types'

export type ActivityKind =
  // Human-authored
  | 'comment'
  // Relay state machine (new in workflow design)
  | 'batch_created'
  | 'batch_passed'
  | 'batch_sent_back'
  | 'batch_revision_dispatched'
  | 'batch_revision_completed'
  | 'batch_step_advanced'
  // Client lifecycle
  | 'client_created'
  | 'client_profile_edited'
  | 'client_archived'
  | 'client_imported'
  // Assignments
  | 'client_am_assigned'
  | 'client_am_unassigned'
  | 'client_designer_assigned'
  | 'client_designer_unassigned'
  // Run lifecycle (legacy, may collapse into batch_* once migration runs)
  | 'run_created'
  | 'run_started'
  | 'run_copy_ready'
  | 'run_completed'
  | 'run_failed'
  | 'run_due_date_changed'
  // Post lifecycle
  | 'posts_created'
  | 'post_edited'
  // Membership
  | 'member_invited'
  | 'member_joined'
  | 'member_role_changed'
  | 'member_removed'

/**
 * Per-kind payload shape. Loose now, will tighten with Zod once Rails ships
 * the canonical schemas in src/lib/schemas/activity.ts.
 */
export type ActivityPayload =
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
  // Catch-all for not-yet-modeled kinds. Phase 4+ tightens the union.
  | { kind: Exclude<ActivityKind, 'comment' | `batch_${string}`>; [key: string]: unknown }

export interface ActivityActor {
  id: string
  name: string
  avatarUrl?: string | null
}

export interface ActivityEventView {
  id: string
  clientId: string
  runId: string | null
  postId: string | null
  /** Optional. Phase 0 schema: ActivityEvent doesn't reference Batch directly,
   *  but most batch_* kinds carry batchId in their payload. */
  actor: ActivityActor | null
  kind: ActivityKind
  payload: ActivityPayload
  createdAt: Date
  /** Convenience: Mentions for *this viewer* on this event. Null = not loaded. */
  myMention?: { id: string; readAt: Date | null } | null
}

export interface MentionInboxRow {
  mentionId: string
  readAt: Date | null
  event: ActivityEventView
  client: { id: string; name: string }
}
