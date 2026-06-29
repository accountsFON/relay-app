'use server'

import * as React from 'react'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { ActivityKind, EventVisibility, RelayStep } from '@prisma/client'
import { signToken, verifySession, verifyToken, hashToken } from '@/lib/magic-link'
import { db } from '@/db/client'
import { findByTokenHash } from '@/server/repositories/magicLinks'
import {
  findActiveSession,
  findSessionWithItems,
  saveDraftItem,
  startSession,
  submitSession,
} from '@/server/repositories/reviewSessions'
import { startNextRound } from '@/server/services/reviewRound'
import { advanceFromClientReview } from '@/server/services/relay'
import { mapReviewDecision } from '@/lib/relay-review-decision'
import { snapshotPostVersion } from '@/server/services/postVersions'
import { recordActivity } from '@/server/services/activity'
import { sendEmail } from '@/lib/resend'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { bulkResolveOnPost, bulkReopenOnPost } from '@/server/repositories/threads'
import { sendMagicLinkEmail } from '@/server/services/sendMagicLinkEmail'
import {
  ReviewSubmittedDigestEmail,
  buildSubject,
  type DigestPin,
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
  // Keep the AM-side batch + review session list fresh too; a reviewer
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
 * `src/server/services/reviewRound.ts` (Layer 2 Task 2.4), not here,
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
 * link's batch, without the latter check a reviewer could forge a
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
  // reviewer never called startReviewSessionAction first; saving a draft
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
 * Mirrors `appBaseUrl` in `src/server/actions/magicLink.ts`, prefer the
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
  /** Soft warning: submission succeeded but the state-machine advance failed. */
  advanceError?: string
  /** Present when the submit advanced the relay. */
  advanced?: { toStep: RelayStep; newHolderId: string }
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
  // double-click cannot create duplicate emails on its own, but we still
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
              assignedDesignerId: true,
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

  // Pull open, client-left pins for every post in the batch so the digest
  // can render a Pins subsection per post (Wave J4). Scope:
  //   - status open  → resolved pins are AM-cleared, no need to re-surface
  //   - reviewerToken NOT null  → only client-left pins (AMs leave their
  //     own pins from the AM surface; those are not "client feedback")
  //   - first comment only  → the pin's initial body; replies live in-app
  // We index by postId on the client side so the per-item loop below can
  // attach pins without an N+1.
  const pinRows =
    link && posts.length > 0
      ? await db.postThread.findMany({
          where: {
            postId: { in: posts.map((p) => p.id) },
            status: 'open',
            reviewerToken: { not: null },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            postId: true,
            imageX: true,
            imageY: true,
            captionFrom: true,
            captionTo: true,
            comments: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { body: true, reviewerName: true },
            },
          },
        })
      : []

  const pinsByPostId = new Map<string, DigestPin[]>()
  for (const row of pinRows) {
    const first = row.comments[0]
    const kind: DigestPin['kind'] =
      row.imageX !== null && row.imageY !== null
        ? 'image'
        : row.captionFrom !== null && row.captionTo !== null
          ? 'caption'
          : 'post'
    const pin: DigestPin = {
      id: row.id,
      kind,
      imageX: row.imageX,
      imageY: row.imageY,
      captionFrom: row.captionFrom,
      captionTo: row.captionTo,
      body: first?.body ?? '',
      reviewerName: first?.reviewerName?.trim() || 'Reviewer',
    }
    const bucket = pinsByPostId.get(row.postId)
    if (bucket) bucket.push(pin)
    else pinsByPostId.set(row.postId, [pin])
  }

  // Always emit the activity event, it is the durable audit trail and
  // does not depend on the email succeeding. recordActivity is itself
  // try/catch-wrapped so this cannot throw.
  if (link) {
    // Auto-notify the assigned AM + designer so they see the bell light up
    // the moment the client submits. Reviewer is a magic-link visitor with
    // no Clerk identity, so the "don't self-notify" gate that applies on
    // AM-triggered events is moot here; neither assignee can be the
    // submitter. We filter nulls out so Mentions only attaches rows for
    // actually-assigned roles.
    const mentionedUserIds = [
      link.batch.client.assignedAmId,
      link.batch.client.assignedDesignerId,
    ].filter((id): id is string => id !== null)

    await recordActivity({
      clientId: link.batch.clientId,
      postId: null,
      runId: null,
      // Reviewer is a magic-link visitor, not a Clerk user, no actorId.
      actorId: null,
      kind: ActivityKind.review_session_submitted,
      visibility: EventVisibility.internal,
      payload: {
        // batchId is required for the notification to deep-link to the review
        // session detail page (resolveHref needs reviewSessionId + batchId);
        // without it the notification falls back to the generic client page.
        batchId: link.batch.id,
        reviewSessionId: active.id,
        magicLinkId: ctx.magicLinkId,
        round: submitted.round,
        summary,
      },
      mentionedUserIds,
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
          pins: pinsByPostId.get(item.postId) ?? [],
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

  let advanceError: string | undefined
  let advanced: { toStep: RelayStep; newHolderId: string } | undefined
  if (link && link.creator?.id) {
    try {
      const decision = mapReviewDecision(summary, posts.length)
      const moved = await advanceFromClientReview({
        batchId: ctx.batchId,
        decision,
        reviewerName: reviewer?.name ?? null,
        fallbackUserId: link.creator.id,
        reviewSessionId: active.id,
      })
      if (moved.advanced && moved.toStep && moved.newHolderId) {
        advanced = { toStep: moved.toStep, newHolderId: moved.newHolderId }
      }
    } catch (err) {
      advanceError = err instanceof Error ? err.message : String(err)
      console.error('[review] submitSessionAction advance failed', {
        reviewSessionId: active.id,
        magicLinkId: ctx.magicLinkId,
        err: advanceError,
      })
    }
  }

  revalidateReviewerPaths(input.token, ctx.clientId, ctx.batchId)
  const result: SubmitSessionActionResult = { ok: true, summary }
  if (emailError) result.emailError = emailError
  if (advanceError) result.advanceError = advanceError
  if (advanced) result.advanced = advanced
  return result
}

// ---- AM-side actions ----

interface ResolvedReviewItemContext {
  reviewItemId: string
  reviewSessionId: string
  postId: string
  magicLinkId: string | null
  batchId: string
  clientId: string
  decision: string
  comment: string | null
  suggestedCaption: string | null
  acceptedAsPostVersionId: string | null
  /** Current Post snapshot, used by acceptCaptionEdit to build the new
   * PostVersion + emit the activity payload. */
  post: {
    id: string
    caption: string
    hashtags: string[]
    graphicHook: string | null
    designerNotes: string | null
  }
}

/**
 * AM-side analog of `resolveReviewerForToken`. Loads a ReviewItem with
 * enough context to drive accept/reject/address actions, and validates
 * the calling AM has client.edit on the underlying client.
 *
 * Walks: ReviewItem → ReviewSession → MagicLink → Batch → Client, then
 * gates on `findClientForUser` to scope by AM/designer assignments (same
 * pattern as `createAndSendMagicLinkAction`).
 */
async function resolveReviewItemForAm(
  reviewItemId: string,
): Promise<{ ctx: Awaited<ReturnType<typeof requireClientEditor>>; item: ResolvedReviewItemContext }> {
  if (!reviewItemId || typeof reviewItemId !== 'string') {
    throw new ReviewSessionActionError('reviewItemId required')
  }

  const ctx = await requireClientEditor()

  const row = await db.reviewItem.findUnique({
    where: { id: reviewItemId },
    include: {
      post: {
        select: {
          id: true,
          caption: true,
          hashtags: true,
          graphicHook: true,
          designerNotes: true,
        },
      },
      reviewSession: {
        select: {
          id: true,
          magicLinkId: true,
          batchId: true,
          batch: { select: { id: true, clientId: true } },
        },
      },
    },
  })
  if (!row) throw new ReviewSessionActionError('Review item not found')

  // Reach the batch via the session's direct batchId (works for both
  // kinds). The legacy magicLink->batch join is no longer needed.
  const clientId = row.reviewSession.batch.clientId
  const client = await findClientForUser(ctx, clientId)
  if (!client) throw new ReviewSessionActionError('Review item not found')

  return {
    ctx,
    item: {
      reviewItemId: row.id,
      reviewSessionId: row.reviewSessionId,
      postId: row.postId,
      magicLinkId: row.reviewSession.magicLinkId,
      batchId: row.reviewSession.batchId,
      clientId,
      decision: row.decision,
      comment: row.comment,
      suggestedCaption: row.suggestedCaption,
      acceptedAsPostVersionId: row.acceptedAsPostVersionId,
      post: row.post,
    },
  }
}

function revalidateAmReviewPaths(clientId: string, batchId: string, reviewSessionId: string): void {
  revalidatePath(`/clients/${clientId}/batches/${batchId}`)
  revalidatePath(
    `/clients/${clientId}/batches/${batchId}/review-sessions/${reviewSessionId}`,
  )
}

/**
 * AM accepts a client's suggested caption edit.
 *
 * Creates a new PostVersion from the suggested caption (carries over the
 * other post body fields), updates `Post.caption`, and records the new
 * PostVersion id on the ReviewItem so the detail page can flip the row
 * from pending → addressed.
 *
 * Idempotent: if the row already has `acceptedAsPostVersionId`, returns
 * that id without creating a duplicate version or re-emitting activity.
 */
export async function acceptCaptionEditAction(input: {
  reviewItemId: string
}): Promise<{ ok: true; postVersionId: string }> {
  const { ctx, item } = await resolveReviewItemForAm(input.reviewItemId)

  if (item.decision !== 'caption_edited') {
    throw new ReviewSessionActionError(
      `Cannot accept caption edit on a ${item.decision} item`,
    )
  }
  if (item.acceptedAsPostVersionId) {
    return { ok: true, postVersionId: item.acceptedAsPostVersionId }
  }

  const newCaption = item.suggestedCaption ?? ''
  if (!newCaption) {
    throw new ReviewSessionActionError(
      'Caption edit has no suggested caption to accept',
    )
  }

  const oldCaption = item.post.caption

  // Snapshot the new caption as a PostVersion. Carries over the other
  // body fields untouched so version history captures the full state at
  // the moment of acceptance (mirrors the contract in
  // src/server/actions/posts.ts which always passes the whole body).
  const created = await snapshotPostVersion({
    postId: item.postId,
    authorId: ctx.userDbId,
    body: {
      caption: newCaption,
      hashtags: item.post.hashtags,
      graphicHook: item.post.graphicHook,
      designerNotes: item.post.designerNotes,
    },
  })
  if (!created) {
    throw new ReviewSessionActionError(
      'Failed to snapshot accepted caption as a PostVersion',
    )
  }

  // Persist the new caption on the Post AND mark the ReviewItem accepted
  // in a single transaction so the UI never sees a half-applied state.
  await db.$transaction([
    db.post.update({
      where: { id: item.postId },
      data: { caption: newCaption },
    }),
    db.reviewItem.update({
      where: { id: item.reviewItemId },
      data: { acceptedAsPostVersionId: created.id },
    }),
  ])

  await recordActivity({
    clientId: item.clientId,
    postId: item.postId,
    actorId: ctx.userDbId,
    kind: ActivityKind.review_caption_edit_accepted,
    visibility: EventVisibility.internal,
    payload: {
      postId: item.postId,
      reviewItemId: item.reviewItemId,
      oldCaption,
      newCaption,
      postVersionId: created.id,
    },
  })

  revalidateAmReviewPaths(item.clientId, item.batchId, item.reviewSessionId)
  return { ok: true, postVersionId: created.id }
}

/**
 * AM rejects a client's suggested caption edit.
 *
 * No DB change in v2: the caption stays as-is, the ReviewItem keeps its
 * `caption_edited` decision and `null` acceptedAsPostVersionId. The AM
 * can re-accept later by clicking Accept Edit again. We still emit an
 * `review_item_addressed` activity event so the audit trail shows the
 * AM consciously dismissed the suggestion.
 */
export async function rejectCaptionEditAction(input: {
  reviewItemId: string
}): Promise<{ ok: true }> {
  const { ctx, item } = await resolveReviewItemForAm(input.reviewItemId)

  if (item.decision !== 'caption_edited') {
    throw new ReviewSessionActionError(
      `Cannot reject caption edit on a ${item.decision} item`,
    )
  }

  await recordActivity({
    clientId: item.clientId,
    postId: item.postId,
    actorId: ctx.userDbId,
    kind: ActivityKind.review_item_addressed,
    visibility: EventVisibility.internal,
    payload: {
      postId: item.postId,
      reviewItemId: item.reviewItemId,
      decision: item.decision,
      addressedBy: ctx.userDbId,
      action: 'rejected_caption_edit',
    },
  })

  await db.reviewItem.update({
    where: { id: item.reviewItemId },
    data: { addressedAt: new Date(), addressedBy: ctx.userDbId },
  })

  revalidateAmReviewPaths(item.clientId, item.batchId, item.reviewSessionId)
  return { ok: true }
}

/**
 * AM marks a `changes_requested` (or `caption_edited`) item as addressed.
 *
 * Pure audit event in v2: Layer 0 schema has no `addressedAt` column on
 * ReviewItem and the plan explicitly says to skip the schema bump. The
 * detail page rolls "pending vs addressed" off the activity stream in
 * Layer 3 task 3.4 / 3.5 (the page reads the per-item event count).
 */
export async function addressItemAction(input: {
  reviewItemId: string
}): Promise<{ ok: true }> {
  const { ctx, item } = await resolveReviewItemForAm(input.reviewItemId)

  if (item.decision !== 'changes_requested' && item.decision !== 'caption_edited') {
    throw new ReviewSessionActionError(
      `Cannot mark a ${item.decision} item as addressed`,
    )
  }

  await recordActivity({
    clientId: item.clientId,
    postId: item.postId,
    actorId: ctx.userDbId,
    kind: ActivityKind.review_item_addressed,
    visibility: EventVisibility.internal,
    payload: {
      postId: item.postId,
      reviewItemId: item.reviewItemId,
      decision: item.decision,
      addressedBy: ctx.userDbId,
    },
  })

  await db.reviewItem.update({
    where: { id: item.reviewItemId },
    data: { addressedAt: new Date(), addressedBy: ctx.userDbId },
  })

  revalidateAmReviewPaths(item.clientId, item.batchId, item.reviewSessionId)
  return { ok: true }
}

export interface StartNextRoundActionResult {
  ok: true
  newSessionId: string
  newRound: number
  /** Soft warning: round was opened but the round-2 email did not send. */
  emailError?: string
}

/**
 * AM opens round N+1 on a magic link. Wraps the Layer 2
 * `startNextRound` service (which supersedes the current session,
 * materializes carryforward items, and emits the round-started activity
 * event) and re-sends the magic link email so the reviewer knows there
 * is fresh work to look at. The magic link token does not rotate between
 * rounds, same URL is reused so any past email the client has is also
 * still valid.
 *
 * Email failure does NOT roll back the new round. The AM can manually
 * copy the URL from the magic-link panel if Resend is down.
 */
export async function startNextRoundAction(input: {
  magicLinkId: string
}): Promise<StartNextRoundActionResult> {
  const magicLinkId = input.magicLinkId
  if (!magicLinkId || typeof magicLinkId !== 'string') {
    throw new ReviewSessionActionError('magicLinkId required')
  }

  const ctx = await requireClientEditor()

  // Walk MagicLink → Batch → Client to gate by the AM's assignments.
  const link = await db.magicLink.findUnique({
    where: { id: magicLinkId },
    include: {
      batch: { select: { id: true, clientId: true, scheduledAt: true, label: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  })
  if (!link || link.revokedAt) {
    throw new ReviewSessionActionError('Magic link not found')
  }

  const client = await findClientForUser(ctx, link.batch.clientId)
  if (!client) throw new ReviewSessionActionError('Magic link not found')

  const newSession = await startNextRound({
    magicLinkId,
    by: ctx.userDbId,
  })

  // Re-send the magic link email so the reviewer pops back in. The raw
  // token is deterministic over (magicLinkId, expiresAt) + the
  // MAGIC_LINK_SECRET, so we can re-mint the EXACT same token the AM
  // originally generated, no need to persist the raw value. The
  // tokenHash on MagicLink stays valid against this re-minted token
  // because the hash is over the same signed string.
  let emailError: string | undefined
  const recipientEmail = link.defaultReviewerEmail?.trim()
  const recipientName = link.defaultReviewerName?.trim()
  if (!recipientEmail || !recipientName) {
    emailError = 'No recipient on magic link; share the URL manually.'
  } else {
    try {
      const reMintedToken = signToken({
        magicLinkId: link.id,
        expiresAt: link.expiresAt.getTime(),
      })
      const reviewUrl = `${appBaseUrl()}/review/${reMintedToken}`
      const senderName =
        link.creator?.name?.trim() || link.creator?.email || 'Your Five One Nine team'
      const month = link.batch.scheduledAt
        ? monthLabel(link.batch.scheduledAt)
        : link.batch.label
      await sendMagicLinkEmail({
        recipientName,
        recipientEmail,
        senderName,
        clientName: client.name,
        monthLabel: month,
        reviewUrl,
        expiresAt: link.expiresAt,
      })
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err)
      console.error('[review] startNextRoundAction email send failed', {
        magicLinkId,
        err: emailError,
      })
    }
  }

  revalidateAmReviewPaths(client.id, link.batch.id, newSession.id)
  return emailError
    ? { ok: true, newSessionId: newSession.id, newRound: newSession.round, emailError }
    : { ok: true, newSessionId: newSession.id, newRound: newSession.round }
}

const REVIEW_PIN_RESOLVE_REASON = 'Addressed from review session'

/**
 * AM clears a whole post from the review session detail page in one click:
 * records the review item addressed (when a non-approved item is present)
 * AND resolves every open CLIENT pin on the post. The two halves of the
 * mirror. For an approved-but-pinned post there is no reviewItemId, so the
 * action only bulk-resolves pins.
 *
 * Auth: requireClientEditor + findClientForUser scopes the post to the AM's
 * assignments (same gate as the other AM-side review actions). clientId and
 * batchId are derived server-side from the post; reviewSessionId is used only
 * for path revalidation.
 */
export async function markPostAddressedAction(input: {
  postId: string
  reviewItemId?: string
  reviewSessionId: string
}): Promise<{ ok: true; pinsResolved: number }> {
  const ctx = await requireClientEditor()

  if (!input.postId || typeof input.postId !== 'string') {
    throw new ReviewSessionActionError('postId required')
  }

  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, clientId: true, batchId: true },
  })
  if (!post || !post.batchId) {
    throw new ReviewSessionActionError('Post not found')
  }

  const client = await findClientForUser(ctx, post.clientId)
  if (!client) throw new ReviewSessionActionError('Post not found')

  // Address the review item half, when present.
  if (input.reviewItemId) {
    const item = await db.reviewItem.findUnique({
      where: { id: input.reviewItemId },
      select: { id: true, postId: true, decision: true },
    })
    if (!item || item.postId !== input.postId) {
      throw new ReviewSessionActionError('Review item does not belong to this post')
    }
    if (item.decision === 'changes_requested' || item.decision === 'caption_edited') {
      await recordActivity({
        clientId: post.clientId,
        postId: post.id,
        actorId: ctx.userDbId,
        kind: ActivityKind.review_item_addressed,
        visibility: EventVisibility.internal,
        payload: {
          postId: post.id,
          reviewItemId: item.id,
          decision: item.decision,
          addressedBy: ctx.userDbId,
        },
      })
      await db.reviewItem.update({
        where: { id: item.id },
        data: { addressedAt: new Date(), addressedBy: ctx.userDbId },
      })
    }
  }

  // Resolve the pins half (client pins only, leave any AM pins alone).
  const pinsResolved = await bulkResolveOnPost({
    postId: post.id,
    resolvedBy: ctx.userDbId,
    resolvedReason: REVIEW_PIN_RESOLVE_REASON,
    onlyClientPins: true,
  })

  revalidateAmReviewPaths(post.clientId, post.batchId, input.reviewSessionId)
  return { ok: true, pinsResolved }
}

/**
 * Inverse of markPostAddressedAction: returns a handled post to "needs
 * action" on the review session detail page. Re-opens the client pins that
 * Mark addressed resolved (review reason only) AND un-addresses the review
 * item — clearing addressedAt, or un-accepting a caption edit (revert the
 * post caption to its pre-accept value + append a PostVersion).
 */
export async function unmarkPostAddressedAction(input: {
  postId: string
  reviewItemId?: string
  reviewSessionId: string
}): Promise<{ ok: true; pinsReopened: number }> {
  const ctx = await requireClientEditor()

  if (!input.postId || typeof input.postId !== 'string') {
    throw new ReviewSessionActionError('postId required')
  }

  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: {
      id: true,
      clientId: true,
      batchId: true,
      caption: true,
      hashtags: true,
      graphicHook: true,
      designerNotes: true,
    },
  })
  if (!post || !post.batchId) {
    throw new ReviewSessionActionError('Post not found')
  }

  const client = await findClientForUser(ctx, post.clientId)
  if (!client) throw new ReviewSessionActionError('Post not found')

  // Re-open the pins half: ALL resolved client pins on the post, regardless of
  // how they were resolved. A post becomes "handled" when its client pins are
  // resolved, and in practice that happens via the per-pin Resolve popover,
  // which records resolvedReason = null (not the Mark addressed reason). So
  // scoping the re-open to REVIEW_PIN_RESOLVE_REASON made un-address a no-op
  // for those posts; reopening every client pin is the true inverse of
  // "this post has no open client pins". (AM-authored pins stay untouched via
  // onlyClientPins.)
  const pinsReopened = await bulkReopenOnPost({
    postId: post.id,
    onlyClientPins: true,
  })

  // Un-address the item half, when present.
  let unaccepted = false
  if (input.reviewItemId) {
    const item = await db.reviewItem.findUnique({
      where: { id: input.reviewItemId },
      select: { id: true, postId: true, acceptedAsPostVersionId: true },
    })
    if (!item || item.postId !== input.postId) {
      throw new ReviewSessionActionError('Review item does not belong to this post')
    }

    if (item.acceptedAsPostVersionId) {
      // Scope to THIS item's accept event: a post can have multiple accepted
      // caption edits across review rounds (one ReviewItem per session per
      // post), each its own event with the same postId. Keying on postId
      // alone would revert to the wrong round's caption when un-accepting
      // from a superseded session view.
      const acceptEvent = await db.activityEvent.findFirst({
        where: {
          postId: post.id,
          kind: ActivityKind.review_caption_edit_accepted,
          payload: { path: ['reviewItemId'], equals: input.reviewItemId },
        },
        orderBy: { createdAt: 'desc' },
        select: { payload: true },
      })
      const payload = acceptEvent?.payload
      const oldCaption =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        'oldCaption' in payload &&
        typeof (payload as Record<string, unknown>).oldCaption === 'string'
          ? ((payload as Record<string, unknown>).oldCaption as string)
          : null
      if (oldCaption === null) {
        throw new ReviewSessionActionError(
          'Cannot un-accept: no prior caption recorded for this post',
        )
      }
      const snapshot = await snapshotPostVersion({
        postId: post.id,
        authorId: ctx.userDbId,
        body: {
          caption: oldCaption,
          hashtags: post.hashtags,
          graphicHook: post.graphicHook,
          designerNotes: post.designerNotes,
        },
      })
      if (!snapshot) {
        throw new ReviewSessionActionError('Failed to snapshot caption revert')
      }
      await db.$transaction([
        db.post.update({ where: { id: post.id }, data: { caption: oldCaption } }),
        db.reviewItem.update({
          where: { id: item.id },
          data: { acceptedAsPostVersionId: null },
        }),
      ])
      unaccepted = true
    } else {
      await db.reviewItem.update({
        where: { id: item.id },
        data: { addressedAt: null, addressedBy: null },
      })
    }
  }

  await recordActivity({
    clientId: post.clientId,
    postId: post.id,
    actorId: ctx.userDbId,
    kind: ActivityKind.review_item_unaddressed,
    visibility: EventVisibility.internal,
    payload: {
      kind: 'review_item_unaddressed',
      postId: post.id,
      reviewItemId: input.reviewItemId ?? null,
      unaccepted,
      pinsReopened,
    },
  })

  revalidateAmReviewPaths(post.clientId, post.batchId, input.reviewSessionId)
  return { ok: true, pinsReopened }
}
