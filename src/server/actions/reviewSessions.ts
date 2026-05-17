'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { verifySession, verifyToken, hashToken } from '@/lib/magic-link'
import { db } from '@/db/client'
import { findByTokenHash } from '@/server/repositories/magicLinks'
import {
  findActiveSession,
  saveDraftItem,
  startSession,
} from '@/server/repositories/reviewSessions'
import type { ReviewDecisionType } from '@/types/review-session'

/**
 * Server actions wrapping `src/server/repositories/reviewSessions.ts`.
 *
 * Two auth surfaces:
 *
 *   - Reviewer-side (called from `/review/[token]`): validates the URL
 *     token, the magic-link session cookie, AND that the cookie's
 *     magicLinkId matches the URL token's. Throws if any check fails.
 *
 *   - AM-side (Clerk-authenticated): not yet implemented in this file.
 *     Lands in Layer 2 Task 2.5 (submitSessionAction) and Layer 3 Task
 *     3.4 (markSupersededAction + acceptCaptionEditAction).
 *
 * Mirrors the dual-auth pattern in `src/server/actions/threads.ts`.
 */

const MAGIC_LINK_SESSION_COOKIE = 'magic-link-session'

// Internal-only error class. 'use server' modules can only export async
// functions, so we cannot export this directly; callers see a generic
// Error with a meaningful message and discriminating `name`.
class ReviewSessionActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewSessionActionError'
  }
}

interface ResolvedReviewer {
  magicLinkId: string
  reviewerId: string
  batchId: string
  clientId: string
}

/**
 * Resolves the reviewer for a given URL token, returning the magic link
 * + reviewer ids (plus batch/client for revalidation). Validates:
 *   1. token signature + expiry (verifyToken)
 *   2. magic link exists + not revoked + batch not deleted
 *   3. session cookie signature + expiry (verifySession)
 *   4. cookie's magicLinkId === URL token's magicLinkId (prevents
 *      cross-link session hijacking via lifted cookies)
 *   5. reviewer row still exists
 */
async function resolveReviewerForToken(token: string): Promise<ResolvedReviewer> {
  if (!token || typeof token !== 'string') {
    throw new ReviewSessionActionError('token required')
  }

  const verified = verifyToken(token)
  if (!verified) {
    throw new ReviewSessionActionError('Invalid or expired link')
  }

  const link = await findByTokenHash(hashToken(token))
  if (!link || link.revokedAt || link.batch.deletedAt) {
    throw new ReviewSessionActionError('Link no longer available')
  }

  const jar = await cookies()
  const cookieValue = jar.get(MAGIC_LINK_SESSION_COOKIE)?.value
  if (!cookieValue) {
    throw new ReviewSessionActionError('No reviewer session; confirm identity first')
  }

  const session = verifySession(cookieValue)
  if (!session) {
    throw new ReviewSessionActionError('Reviewer session expired or invalid')
  }
  if (session.magicLinkId !== link.id) {
    // Lifted cookie from a different link; refuse rather than silently
    // attaching the wrong reviewer to a session.
    throw new ReviewSessionActionError('Reviewer session does not match this link')
  }

  // Belt-and-suspenders: the cookie is signed but the reviewer row could
  // have been deleted (cascade off MagicLink revoke + batch delete).
  // findReviewerBySession uses sessionId; we have the reviewer id from
  // the signed payload, so go straight to the primary key.
  const reviewer = await db.magicLinkReviewer.findUnique({
    where: { id: session.reviewerId },
  })
  if (!reviewer || reviewer.magicLinkId !== link.id) {
    throw new ReviewSessionActionError('Reviewer no longer associated with this link')
  }

  return {
    magicLinkId: link.id,
    reviewerId: reviewer.id,
    batchId: link.batchId,
    clientId: link.batch.clientId,
  }
}

function revalidateReviewerPaths(token: string, clientId: string, batchId: string): void {
  revalidatePath(`/review/${token}`)
  // Keep the AM-side batch + review session list fresh too — a reviewer
  // starting or saving drafts is observable on the AM dashboard.
  revalidatePath(`/clients/${clientId}/batches/${batchId}`)
}

// ---- Reviewer-side actions ----

/**
 * Reviewer hits any review affordance for the first time on this round.
 * If a fresh in_progress session already exists for this reviewer, this
 * action is idempotent and returns its id. Otherwise creates one at
 * round 1.
 *
 * Round 2+ session creation is owned by `startNextRound` in
 * `src/server/services/reviewRound.ts` (Layer 2 Task 2.4), not here —
 * the reviewer cannot self-trigger a new round, the AM has to close out
 * the prior one first.
 */
export async function startReviewSessionAction(input: {
  token: string
}): Promise<{ reviewSessionId: string }> {
  const ctx = await resolveReviewerForToken(input.token)

  const existing = await findActiveSession({
    magicLinkId: ctx.magicLinkId,
    reviewerId: ctx.reviewerId,
  })
  if (existing) {
    return { reviewSessionId: existing.id }
  }

  const created = await startSession({
    magicLinkId: ctx.magicLinkId,
    reviewerId: ctx.reviewerId,
    round: 1,
  })

  revalidateReviewerPaths(input.token, ctx.clientId, ctx.batchId)
  return { reviewSessionId: created.id }
}

/**
 * Reviewer marks a decision (or saves a draft comment / suggested
 * caption) on a single post. Upserts the ReviewItem keyed on
 * (reviewSessionId, postId).
 *
 * Validates the reviewer owns the session AND the post belongs to the
 * link's batch — without the latter check a reviewer could forge a
 * postId from a different batch into the upsert and silently corrupt
 * another batch's items.
 */
export async function saveReviewDraftAction(input: {
  token: string
  postId: string
  decision: ReviewDecisionType
  comment?: string | null
  suggestedCaption?: string | null
}): Promise<{ reviewItemId: string }> {
  const ctx = await resolveReviewerForToken(input.token)

  if (!input.postId || typeof input.postId !== 'string') {
    throw new ReviewSessionActionError('postId required')
  }

  // Resolve the active session for this reviewer. Create lazily if the
  // reviewer never called startReviewSessionAction first — saving a draft
  // is the strongest signal of intent and we don't want a race where the
  // very first tap drops on the floor.
  let session = await findActiveSession({
    magicLinkId: ctx.magicLinkId,
    reviewerId: ctx.reviewerId,
  })
  if (!session) {
    session = await startSession({
      magicLinkId: ctx.magicLinkId,
      reviewerId: ctx.reviewerId,
      round: 1,
    })
  }

  // Cross-batch postId guard. Cheap indexed lookup.
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, batchId: true },
  })
  if (!post || post.batchId !== ctx.batchId) {
    throw new ReviewSessionActionError('Post does not belong to this review link')
  }

  const item = await saveDraftItem({
    reviewSessionId: session.id,
    postId: input.postId,
    decision: input.decision,
    comment: input.comment ?? null,
    suggestedCaption: input.suggestedCaption ?? null,
  })

  revalidateReviewerPaths(input.token, ctx.clientId, ctx.batchId)
  return { reviewItemId: item.id }
}
