'use server'

import { ActivityKind, EventVisibility } from '@prisma/client'
import { db } from '@/db/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { recordActivity } from '@/server/services/activity'

/**
 * Server actions backing the notification bell (Phase 1).
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 15 — submitPreviewReviewAction + /preview Submit button
 *
 * submitPreviewReviewAction emits a `preview_review_submitted` ActivityEvent
 * with a designer Mention so the assigned designer's bell lights up the
 * moment the AM clicks "Submit" on the /preview page. The action is a
 * silent no-op when the AM has no unresolved comments authored on the
 * batch — no event, no mention. We never spam the designer with an empty
 * review summary.
 */

export interface SubmitPreviewReviewInput {
  batchId: string
  /**
   * Optional override for the actor user db id. Production callers omit this
   * and let requireOrgContext resolve from Clerk. Integration tests pass it
   * directly to avoid mocking the Clerk session.
   */
  actorUserId?: string
}

export interface SubmitPreviewReviewResult {
  notified: boolean
  commentCount?: number
}

export async function submitPreviewReviewAction(
  input: SubmitPreviewReviewInput,
): Promise<SubmitPreviewReviewResult> {
  if (!input.batchId || typeof input.batchId !== 'string') {
    throw new Error('batchId required')
  }

  // Resolve actor. Tests pass actorUserId directly; production reads it
  // from the Clerk-backed OrgContext.
  let actorUserId: string
  if (input.actorUserId) {
    actorUserId = input.actorUserId
  } else {
    const ctx = await requireOrgContext()
    actorUserId = ctx.userDbId
  }

  const batch = await db.batch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      clientId: true,
      client: {
        select: {
          id: true,
          assignedDesignerId: true,
        },
      },
    },
  })
  if (!batch) throw new Error('Batch not found')

  // Count unresolved AM-authored thread comments on this batch's posts.
  // The PostComment row carries authorId; the parent PostThread carries
  // resolvedAt. "Unresolved" means the *thread* is not resolved — even an
  // older comment under an open thread is still actionable for the
  // designer.
  const commentCount = await db.postComment.count({
    where: {
      authorId: actorUserId,
      thread: {
        resolvedAt: null,
        post: { batchId: input.batchId },
      },
    },
  })

  if (commentCount === 0) {
    // Silent no-op: no event, no mention. Caller surfaces a toast/inline
    // "Nothing to send" message but the audit trail stays clean.
    return { notified: false }
  }

  // Skip self-notify (AM is also the designer for this client) — same
  // gate the postCommentAction emit point uses. No designer assigned
  // also lands here.
  const designerId = batch.client.assignedDesignerId
  const mentionedUserIds =
    designerId && designerId !== actorUserId ? [designerId] : []

  await recordActivity({
    clientId: batch.clientId,
    postId: null,
    runId: null,
    actorId: actorUserId,
    kind: ActivityKind.preview_review_submitted,
    visibility: EventVisibility.internal,
    payload: {
      batchId: input.batchId,
      commentCount,
    },
    mentionedUserIds,
  })

  return { notified: true, commentCount }
}
