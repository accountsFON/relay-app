import { ActivityKind, EventVisibility } from '@prisma/client'
import { db } from '@/db/client'
import { recordActivity } from '@/server/services/activity'

/**
 * Pure helper: emit the `preview_review_submitted` ActivityEvent for
 * `batchId`, authored by `actorUserId`.
 *
 * This module is intentionally NOT marked `'use server'` so its exports
 * are not exposed as RPC endpoints. The `submitPreviewReviewAction`
 * server action (src/server/actions/notifications.ts) wraps this helper
 * after resolving the actor from Clerk and verifying tenant scoping.
 *
 * This helper does NO auth/permission checks. Callers must scope first.
 * Integration tests call it directly with a real test user id so they
 * can exercise the emit path without spinning up Clerk.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 15
 */

export interface SubmitPreviewReviewResult {
  notified: boolean
  commentCount?: number
}

export async function emitPreviewReviewSubmit(input: {
  batchId: string
  actorUserId: string
}): Promise<SubmitPreviewReviewResult> {
  if (!input.batchId || typeof input.batchId !== 'string') {
    throw new Error('batchId required')
  }
  if (!input.actorUserId || typeof input.actorUserId !== 'string') {
    throw new Error('actorUserId required')
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
  // resolvedAt. "Unresolved" means the *thread* is not resolved, even an
  // older comment under an open thread is still actionable for the
  // designer.
  const commentCount = await db.postComment.count({
    where: {
      authorId: input.actorUserId,
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

  // Skip self-notify (AM is also the designer for this client), same
  // gate the postCommentAction emit point uses. No designer assigned
  // also lands here.
  const designerId = batch.client.assignedDesignerId
  const mentionedUserIds =
    designerId && designerId !== input.actorUserId ? [designerId] : []

  await recordActivity({
    clientId: batch.clientId,
    postId: null,
    runId: null,
    actorId: input.actorUserId,
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
