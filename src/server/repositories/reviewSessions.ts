/**
 * ReviewSession repository (v2 client review flow).
 *
 * Persistence layer for the new client review session model: one
 * `ReviewSession` per reviewer per round, with one `ReviewItem` per post
 * inside that session capturing decision + optional comment + optional
 * caption edit.
 *
 * Auth gating happens one layer up in `src/server/actions/reviewSessions.ts`.
 * This file is intentionally org-agnostic — sessions scope through
 * `MagicLink → Batch → Client → Organization`, same indirection pattern
 * as `threads.ts`. The org-filter lint allowlist includes this file for
 * that reason.
 *
 * Mirrors the existing repo shape in `src/server/repositories/threads.ts`.
 */
import { db } from '@/db/client'
import type {
  ReviewDecisionType,
  ReviewSessionStatusType,
  ReviewSessionSummary,
  ReviewSessionWithItems,
  ReviewItemHydrated,
} from '@/types/review-session'
import type { ReviewSession, ReviewItem, MagicLinkReviewer } from '@prisma/client'

// ---- Errors ----

export class ReviewSessionNotFoundError extends Error {
  constructor(id: string) {
    super(`ReviewSession ${id} not found`)
    this.name = 'ReviewSessionNotFoundError'
  }
}

export class ReviewSessionNotInProgressError extends Error {
  constructor(id: string, status: ReviewSessionStatusType) {
    super(`ReviewSession ${id} is ${status}; expected in_progress`)
    this.name = 'ReviewSessionNotInProgressError'
  }
}

// ---- Row aliases ----

/// Bare Prisma row for the in_progress create/return path. The hydrated
/// shape (with items + post data) is `ReviewSessionWithItems` from
/// `@/types/review-session`.
export type ReviewSessionRow = ReviewSession
export type ReviewSessionWithReviewer = ReviewSession & {
  reviewer: MagicLinkReviewer | null
  items: ReviewItem[]
}

// ---- Helpers ----

function toHydratedItem(row: ReviewItem): ReviewItemHydrated {
  return {
    id: row.id,
    postId: row.postId,
    decision: row.decision as ReviewDecisionType,
    comment: row.comment,
    suggestedCaption: row.suggestedCaption,
    acceptedAsPostVersionId: row.acceptedAsPostVersionId,
    updatedSinceLastReview: row.updatedSinceLastReview,
    lastReviewedVersionId: row.lastReviewedVersionId,
    reviewedAt: row.reviewedAt,
  }
}

function toHydratedSession(
  row: ReviewSession & { items: ReviewItem[] },
): ReviewSessionWithItems {
  return {
    id: row.id,
    magicLinkId: row.magicLinkId,
    reviewerId: row.reviewerId,
    status: row.status as ReviewSessionStatusType,
    round: row.round,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    submittedSummary: (row.submittedSummary as unknown as ReviewSessionSummary | null) ?? null,
    items: row.items.map(toHydratedItem),
  }
}

/**
 * Walks the items and rolls them up into a `ReviewSessionSummary`. Used
 * by `submitSession` to compute and persist the snapshot that the digest
 * email renders. `totalPosts` is the number of items on the session
 * (whether reviewed or not).
 */
export function computeSummary(items: { decision: string }[]): ReviewSessionSummary {
  let approved = 0
  let changesRequested = 0
  let captionEdited = 0
  for (const item of items) {
    if (item.decision === 'approved') approved += 1
    else if (item.decision === 'changes_requested') changesRequested += 1
    else if (item.decision === 'caption_edited') captionEdited += 1
  }
  return {
    approved,
    changesRequested,
    captionEdited,
    totalPosts: items.length,
  }
}

// ---- Public API ----

export interface StartSessionInput {
  magicLinkId: string
  reviewerId: string
  round?: number
}

/**
 * Creates a new in_progress ReviewSession. Round defaults to 1. The
 * caller is responsible for choosing the right round (e.g. via
 * startNextRound which lives in `reviewRound.ts` in Task 2.4).
 */
export async function startSession(
  input: StartSessionInput,
): Promise<ReviewSessionRow> {
  return db.reviewSession.create({
    data: {
      magicLinkId: input.magicLinkId,
      reviewerId: input.reviewerId,
      round: input.round ?? 1,
      status: 'in_progress',
    },
  })
}

export interface FindActiveSessionInput {
  magicLinkId: string
  reviewerId: string
}

/**
 * Returns the most-recently-started in_progress session for this reviewer
 * on this magic link, or null. Used by the page loader to decide whether
 * to render the returning-reviewer banner or start a fresh session.
 */
export async function findActiveSession(
  input: FindActiveSessionInput,
): Promise<ReviewSessionRow | null> {
  return db.reviewSession.findFirst({
    where: {
      magicLinkId: input.magicLinkId,
      reviewerId: input.reviewerId,
      status: 'in_progress',
    },
    orderBy: { startedAt: 'desc' },
  })
}

export interface SaveDraftItemInput {
  reviewSessionId: string
  postId: string
  decision: ReviewDecisionType
  comment?: string | null
  suggestedCaption?: string | null
}

/**
 * Upsert a ReviewItem by (reviewSessionId, postId). First call inserts,
 * subsequent calls for the same post update in place. `reviewedAt` is set
 * to now() on every call so callers can sort items by most-recent edit.
 *
 * The session is NOT checked for in_progress status here; the action
 * layer owns that gate so callers (e.g. AM-side replays) can stay
 * intentional about overrides.
 */
export async function saveDraftItem(
  input: SaveDraftItemInput,
): Promise<ReviewItem> {
  const now = new Date()
  return db.reviewItem.upsert({
    where: {
      reviewSessionId_postId: {
        reviewSessionId: input.reviewSessionId,
        postId: input.postId,
      },
    },
    create: {
      reviewSessionId: input.reviewSessionId,
      postId: input.postId,
      decision: input.decision,
      comment: input.comment ?? null,
      suggestedCaption: input.suggestedCaption ?? null,
      reviewedAt: now,
    },
    update: {
      decision: input.decision,
      comment: input.comment ?? null,
      suggestedCaption: input.suggestedCaption ?? null,
      reviewedAt: now,
    },
  })
}

export interface SubmitSessionInput {
  reviewSessionId: string
}

/**
 * Flip a session from in_progress to submitted. Sets submittedAt to now()
 * and persists a `submittedSummary` snapshot computed from the session's
 * items. Idempotent: re-submitting an already-submitted session is a
 * no-op (preserves the original submittedAt + summary).
 */
export async function submitSession(
  input: SubmitSessionInput,
): Promise<ReviewSessionRow> {
  return db.$transaction(async (tx) => {
    const session = await tx.reviewSession.findUnique({
      where: { id: input.reviewSessionId },
      include: { items: true },
    })
    if (!session) throw new ReviewSessionNotFoundError(input.reviewSessionId)
    if (session.status === 'submitted') return session
    if (session.status !== 'in_progress') {
      throw new ReviewSessionNotInProgressError(
        input.reviewSessionId,
        session.status as ReviewSessionStatusType,
      )
    }

    const summary = computeSummary(session.items)

    return tx.reviewSession.update({
      where: { id: input.reviewSessionId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        submittedSummary: summary as unknown as object,
      },
    })
  })
}

export interface MarkSupersededInput {
  reviewSessionId: string
  /** Clerk user id of the AM closing out the session. Recorded for audit
   * downstream (see ActivityEvent emit in Task 2.4 startNextRound). */
  by: string
}

/**
 * Flip a session to superseded. Used when the AM has addressed every
 * item and is about to open round N+1. Idempotent: re-superseding is a
 * no-op.
 */
export async function markSuperseded(
  input: MarkSupersededInput,
): Promise<void> {
  await db.reviewSession.updateMany({
    where: { id: input.reviewSessionId, status: { in: ['in_progress', 'submitted'] } },
    data: { status: 'superseded' },
  })
}

/**
 * Returns every ReviewSession for a batch, ordered most-recent first.
 * In_progress sessions (submittedAt = null) sort to the end so the AM
 * sees submitted work at the top. Each session carries its hydrated
 * items and reviewer for the batch detail page.
 */
export async function listSessionsForBatch(
  batchId: string,
): Promise<ReviewSessionWithReviewer[]> {
  return db.reviewSession.findMany({
    where: { magicLink: { batchId } },
    orderBy: [
      { submittedAt: { sort: 'desc', nulls: 'last' } },
      { startedAt: 'desc' },
    ],
    include: {
      reviewer: true,
      items: true,
    },
  })
}

export interface FindSessionWithItemsInput {
  reviewSessionId: string
}

/**
 * Hydrates a ReviewSession into the canonical `ReviewSessionWithItems`
 * shape consumed by the AM-side detail page and the digest email
 * builder. Each item carries its underlying Post (the call site joins
 * Post data downstream).
 */
export async function findSessionWithItems(
  input: FindSessionWithItemsInput,
): Promise<ReviewSessionWithItems | null> {
  const row = await db.reviewSession.findUnique({
    where: { id: input.reviewSessionId },
    include: {
      items: {
        orderBy: { reviewedAt: 'asc' },
        include: { post: true },
      },
    },
  })
  if (!row) return null
  return toHydratedSession(row)
}
