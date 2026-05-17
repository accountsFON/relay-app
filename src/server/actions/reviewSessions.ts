'use server'

import * as React from 'react'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ActivityKind, EventVisibility } from '@prisma/client'
import { verifySession, verifyToken, hashToken } from '@/lib/magic-link'
import { db } from '@/db/client'
import { findByTokenHash } from '@/server/repositories/magicLinks'
import {
  findActiveSession,
  findSessionWithItems,
  saveDraftItem,
  startSession,
  submitSession,
} from '@/server/repositories/reviewSessions'
import { recordActivity } from '@/server/services/activity'
import { sendEmail } from '@/lib/resend'
import {
  ReviewSubmittedDigestEmail,
  buildSubject,
  type DigestReviewItem,
  type ReviewSubmittedDigestEmailProps,
} from '@/server/emails/ReviewSubmittedDigestEmail'
import type {
  ReviewDecisionType,
  ReviewSessionSummary,
} from '@/types/review-session'

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

// ---- Submit Review ----

/**
 * Friendly base URL for AM-side links rendered into the digest email.
 * Mirrors `appBaseUrl` in `src/server/actions/magicLink.ts` — prefer the
 * stable prod alias over per-deployment URLs so the link in the AM's
 * inbox keeps working after the next deploy.
 */
function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function monthLabel(d: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function firstName(full: string | null | undefined): string {
  const trimmed = (full ?? '').trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

export interface SubmitSessionActionResult {
  ok: true
  summary: ReviewSessionSummary
  /** Soft warning: submission succeeded but the digest email did not send. */
  emailError?: string
}

/**
 * Reviewer clicks Submit Review. Flips the session to submitted, persists
 * the summary snapshot, sends the ReviewSubmittedDigestEmail to the AM
 * (CC the assigned AM if different from the link creator), emits a
 * `review_session_submitted` ActivityEvent.
 *
 * Email failure does NOT roll back the submission. The reviewer has done
 * the work and the persisted session is the source of truth; the AM can
 * always open Relay to triage even if the email never arrives. We surface
 * `emailError` in the result so the client UI can show a soft warning
 * ("Submitted, but we could not send the digest email").
 *
 * Reply-To is set to the reviewer's email so the AM hitting Reply lands
 * in the client's inbox (footer copy in the template promises this).
 */
export async function submitSessionAction(input: {
  token: string
}): Promise<SubmitSessionActionResult> {
  const ctx = await resolveReviewerForToken(input.token)

  const active = await findActiveSession({
    magicLinkId: ctx.magicLinkId,
    reviewerId: ctx.reviewerId,
  })
  if (!active) {
    throw new ReviewSessionActionError('No active session to submit')
  }

  const hydrated = await findSessionWithItems({ reviewSessionId: active.id })
  if (!hydrated) {
    // Race: session was deleted between findActiveSession and the hydrate.
    throw new ReviewSessionActionError('No active session to submit')
  }
  if (hydrated.items.length === 0) {
    throw new ReviewSessionActionError(
      'Cannot submit a review with no decisions. Mark at least one post first.',
    )
  }

  // Flip status + persist summary. Repo is idempotent on re-submit, so a
  // double-click cannot create duplicate emails on its own — but we still
  // gate by `active` above to keep the email send out of the re-submit path.
  const submitted = await submitSession({ reviewSessionId: active.id })
  const summary =
    (submitted.submittedSummary as unknown as ReviewSessionSummary | null) ?? {
      approved: 0,
      changesRequested: 0,
      captionEdited: 0,
      totalPosts: hydrated.items.length,
    }

  // Pull the data the digest email + activity event need in a single round
  // trip. We need:
  //   - the MagicLink for createdBy (AM who minted the link)
  //   - the Batch (for label/month + revalidate path)
  //   - the Client (for name + assignedAmId)
  //   - the MagicLinkReviewer (for display name + reply-to email)
  //   - every Post on the batch in canonical order (for postNumber +
  //     caption baseline for the diff)
  const link = await db.magicLink.findUnique({
    where: { id: ctx.magicLinkId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      batch: {
        include: {
          client: {
            select: {
              id: true,
              name: true,
              assignedAmId: true,
              assignedAm: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  })
  const reviewer = await db.magicLinkReviewer.findUnique({
    where: { id: ctx.reviewerId },
    select: { name: true, email: true },
  })
  const posts = link
    ? await db.post.findMany({
        where: { batchId: link.batchId, deletedAt: null },
        orderBy: { postDate: 'asc' },
        select: { id: true, postDate: true, caption: true },
      })
    : []

  // Always emit the activity event — it is the durable audit trail and
  // does not depend on the email succeeding. recordActivity is itself
  // try/catch-wrapped so this cannot throw.
  if (link) {
    await recordActivity({
      clientId: link.batch.clientId,
      postId: null,
      runId: null,
      // Reviewer is a magic-link visitor, not a Clerk user — no actorId.
      actorId: null,
      kind: ActivityKind.review_session_submitted,
      visibility: EventVisibility.internal,
      payload: {
        reviewSessionId: active.id,
        magicLinkId: ctx.magicLinkId,
        round: submitted.round,
        summary,
      },
    })
  }

  let emailError: string | undefined
  if (!link) {
    // Defensive: the link row disappeared between resolveReviewerForToken
    // and this lookup. Submission already succeeded; surface a soft error.
    emailError = 'Magic link not found at email send time'
  } else if (!link.creator?.email) {
    emailError = 'Link creator has no email on record'
  } else {
    try {
      // Build DigestReviewItem rows by joining the hydrated session items
      // with the post lookup. postNumber is 1-based, in canonical batch
      // order (postDate asc), matching how the AM-side detail page numbers
      // posts.
      const postIndex = new Map(
        posts.map((p, i) => [p.id, { post: p, number: i + 1 }]),
      )
      const digestItems: DigestReviewItem[] = []
      for (const item of hydrated.items) {
        const lookup = postIndex.get(item.postId)
        if (!lookup) continue // post deleted after the reviewer touched it
        digestItems.push({
          ...item,
          post: {
            id: lookup.post.id,
            postDate: lookup.post.postDate,
            caption: lookup.post.caption,
          },
          postNumber: lookup.number,
        })
      }
      // Email-side ordering: walk in batch order so the AM reads the
      // digest in the same sequence as the in-app detail page.
      digestItems.sort((a, b) => a.postNumber - b.postNumber)

      const batch = link.batch
      const client = batch.client
      const month = batch.scheduledAt ? monthLabel(batch.scheduledAt) : batch.label
      const batchUrl = `${appBaseUrl()}/clients/${client.id}/batches/${batch.id}`
      const amName = firstName(link.creator.name)
      const reviewerName = (reviewer?.name ?? 'A reviewer').trim() || 'A reviewer'
      const reviewerEmail = reviewer?.email?.trim() || undefined

      const emailProps: ReviewSubmittedDigestEmailProps = {
        amName,
        reviewerName,
        clientName: client.name,
        monthLabel: month,
        round: submitted.round,
        summary,
        items: digestItems,
        batchUrl,
        submittedAt: submitted.submittedAt ?? new Date(),
        reviewerReplyEmail: reviewerEmail,
      }

      // Recipients: always the link creator; also the assigned AM on the
      // client if different. The Layer 1 sendEmail wrapper takes a single
      // `to` string and has no CC parameter, so we fan out one send per
      // recipient. The cost is two Resend API calls in the worst case;
      // the win is that we do not touch the Layer 1 module surface and
      // each recipient gets a clean From/Reply-To header pair.
      const recipients: string[] = [link.creator.email]
      if (
        client.assignedAm &&
        client.assignedAm.email &&
        client.assignedAm.id !== link.creator.id
      ) {
        recipients.push(client.assignedAm.email)
      }

      const subject = buildSubject(emailProps)
      const reactNode = React.createElement(ReviewSubmittedDigestEmail, emailProps)
      for (const to of recipients) {
        await sendEmail({
          to,
          subject,
          react: reactNode,
          replyTo: reviewerEmail,
        })
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err)
      console.error('[review] submitSessionAction email send failed', {
        reviewSessionId: active.id,
        magicLinkId: ctx.magicLinkId,
        err: emailError,
      })
    }
  }

  revalidateReviewerPaths(input.token, ctx.clientId, ctx.batchId)
  return emailError ? { ok: true, summary, emailError } : { ok: true, summary }
}
