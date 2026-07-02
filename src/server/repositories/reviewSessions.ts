/**
 * ReviewSession repository (v2 client review flow).
 *
 * Persistence layer for the new client review session model: one
 * `ReviewSession` per reviewer per round, with one `ReviewItem` per post
 * inside that session capturing decision + optional comment + optional
 * caption edit.
 *
 * Auth gating happens one layer up in `src/server/actions/reviewSessions.ts`.
 * This file is intentionally org-agnostic, sessions scope through
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
    addressedAt: row.addressedAt,
    noteResolvedAt: row.noteResolvedAt,
  }
}

function toHydratedSession(
  row: ReviewSession & { items: ReviewItem[] },
): ReviewSessionWithItems {
  return {
    id: row.id,
    kind: row.kind as 'client' | 'internal',
    batchId: row.batchId,
    magicLinkId: row.magicLinkId,
    reviewerId: row.reviewerId,
    reviewerUserId: row.reviewerUserId,
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

// ---- Invariant ----

export class ReviewSessionKindInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewSessionKindInvariantError'
  }
}

/**
 * Enforces the session-kind invariant at the create boundary:
 *   - kind='client'   => magicLinkId set AND reviewerUserId null
 *   - kind='internal' => reviewerUserId set AND magicLinkId null
 *
 * A row that carries both a MagicLinkReviewer identity and a Clerk reviewer
 * (or neither for its kind) is malformed. The typed `startSession` inputs make
 * this structurally hard to express, but this guard defends the DB row against
 * a cast or a future caller that bypasses the union.
 */
export function assertSessionKindInvariant(row: {
  kind: 'client' | 'internal'
  magicLinkId: string | null
  reviewerUserId: string | null
}): void {
  if (row.kind === 'client') {
    if (!row.magicLinkId) {
      throw new ReviewSessionKindInvariantError(
        'client session requires a magicLinkId',
      )
    }
    if (row.reviewerUserId) {
      throw new ReviewSessionKindInvariantError(
        'client session must not have a reviewerUserId',
      )
    }
    return
  }
  // internal
  if (!row.reviewerUserId) {
    throw new ReviewSessionKindInvariantError(
      'internal session requires a reviewerUserId',
    )
  }
  if (row.magicLinkId) {
    throw new ReviewSessionKindInvariantError(
      'internal session must not have a magicLinkId',
    )
  }
}

// ---- Public API ----

/// Client (magic-link reviewer) session input. `batchId` is optional: when
/// omitted it is derived from the magic link so existing client call sites
/// need no change.
export interface StartClientSessionInput {
  kind?: 'client'
  magicLinkId: string
  reviewerId: string
  batchId?: string
  round?: number
}

/// Internal (Clerk-user / AM) session input. No magic link; `batchId` and the
/// `reviewerUserId` are required.
export interface StartInternalSessionInput {
  kind: 'internal'
  batchId: string
  reviewerUserId: string
  round?: number
}

export type StartSessionInput =
  | StartClientSessionInput
  | StartInternalSessionInput

/**
 * Creates a new in_progress ReviewSession. Round defaults to 1. The caller
 * is responsible for choosing the right round (e.g. via startNextRound which
 * lives in `reviewRound.ts`).
 *
 * Two kinds:
 *   - client (default): magic-link reviewer. `batchId` is derived from the
 *     magic link when not passed, so existing call sites are unchanged.
 *   - internal: Clerk-user (AM) reviewer. No magic link; `reviewerUserId` +
 *     `batchId` are required.
 *
 * The kind invariant (client => magicLinkId set + no reviewerUserId; internal
 * => reviewerUserId set + no magicLinkId) is structurally guaranteed by these
 * inputs and asserted at the action boundary (Task 6).
 */
export async function startSession(
  input: StartSessionInput,
): Promise<ReviewSessionRow> {
  if (input.kind === 'internal') {
    assertSessionKindInvariant({
      kind: 'internal',
      magicLinkId: null,
      reviewerUserId: input.reviewerUserId,
    })
    return db.reviewSession.create({
      data: {
        kind: 'internal',
        batchId: input.batchId,
        reviewerUserId: input.reviewerUserId,
        round: input.round ?? 1,
        status: 'in_progress',
      },
    })
  }

  assertSessionKindInvariant({
    kind: 'client',
    magicLinkId: input.magicLinkId,
    reviewerUserId: null,
  })

  const batchId =
    input.batchId ??
    (
      await db.magicLink.findUniqueOrThrow({
        where: { id: input.magicLinkId },
        select: { batchId: true },
      })
    ).batchId

  return db.reviewSession.create({
    data: {
      kind: 'client',
      batchId,
      magicLinkId: input.magicLinkId,
      reviewerId: input.reviewerId,
      round: input.round ?? 1,
      status: 'in_progress',
    },
  })
}

export interface FindActiveClientSessionInput {
  kind?: 'client'
  magicLinkId: string
  reviewerId: string
}

export interface FindActiveInternalSessionInput {
  kind: 'internal'
  batchId: string
  reviewerUserId: string
}

export type FindActiveSessionInput =
  | FindActiveClientSessionInput
  | FindActiveInternalSessionInput

/**
 * Returns the most-recently-started in_progress session for this reviewer,
 * or null. Used by the page loader to decide whether to render the
 * returning-reviewer banner or start a fresh session.
 *
 * Client: keyed on (magicLinkId, reviewerId). Internal: keyed on
 * (batchId, reviewerUserId).
 */
export async function findActiveSession(
  input: FindActiveSessionInput,
): Promise<ReviewSessionRow | null> {
  const where =
    input.kind === 'internal'
      ? {
          kind: 'internal' as const,
          batchId: input.batchId,
          reviewerUserId: input.reviewerUserId,
          status: 'in_progress' as const,
        }
      : {
          kind: 'client' as const,
          magicLinkId: input.magicLinkId,
          reviewerId: input.reviewerId,
          status: 'in_progress' as const,
        }

  return db.reviewSession.findFirst({
    where,
    orderBy: { startedAt: 'desc' },
  })
}

/**
 * The active (in_progress) CLIENT session for a magic link, regardless of
 * which MagicLinkReviewer confirmed. A magic link belongs to one client, so
 * any in_progress client session on the link is "the" session, even after the
 * client re-opens the link and re-confirms their name (which mints a fresh
 * MagicLinkReviewer / reviewerId). Keying on the link, not the reviewer, stops
 * a re-confirm from forking a duplicate session. Highest round first.
 */
export async function findActiveClientSessionForLink(
  magicLinkId: string,
): Promise<ReviewSessionRow | null> {
  return db.reviewSession.findFirst({
    where: { kind: 'client', magicLinkId, status: 'in_progress' },
    orderBy: [{ round: 'desc' }, { startedAt: 'desc' }],
  })
}

/**
 * The most-recent CLIENT session for a magic link in ANY status (highest
 * round, then most recently started). Used to decide whether a returning
 * client has already submitted the current round, so a revisit does NOT
 * lazily create a new round-1 session (only the AM's startNextRound opens a
 * new round).
 */
export async function findLatestClientSessionForLink(
  magicLinkId: string,
): Promise<ReviewSessionRow | null> {
  return db.reviewSession.findFirst({
    where: { kind: 'client', magicLinkId },
    orderBy: [{ round: 'desc' }, { startedAt: 'desc' }],
  })
}

export interface SaveDraftItemInput {
  reviewSessionId: string
  postId: string
  /** Omit to leave the column alone on update; first insert falls back to 'not_reviewed'. */
  decision?: ReviewDecisionType
  /** Tri-state: undefined leaves alone, null clears, string sets. */
  comment?: string | null
  /** Tri-state: undefined leaves alone, null clears, string sets. */
  suggestedCaption?: string | null
}

/**
 * Upsert a ReviewItem by (reviewSessionId, postId). First call inserts,
 * subsequent calls for the same post update in place. `reviewedAt` is set
 * to now() on every call so callers can sort items by most-recent edit.
 *
 * Field semantics on update: every editable field accepts `undefined` to
 * mean "leave alone" so callers can drive partial PATCHes (typing a
 * comment after tapping a decision, or vice versa) without clobbering
 * prior state. Prisma treats `undefined` as "skip this column" on update,
 * so we forward each field raw rather than coercing through `?? null`.
 * On create, decision/comment/suggestedCaption fall back to safe defaults
 * so the row is always valid.
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
      decision: input.decision ?? 'not_reviewed',
      comment: input.comment ?? null,
      suggestedCaption: input.suggestedCaption ?? null,
      reviewedAt: now,
    },
    update: {
      decision: input.decision,
      comment: input.comment,
      suggestedCaption: input.suggestedCaption,
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
  // Query by the direct batchId so BOTH client and internal sessions are
  // returned (the old `magicLink: { batchId }` join missed internal rows,
  // which have no magic link).
  return db.reviewSession.findMany({
    where: { batchId },
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

// ---- Reminder cron query ----

/// One in_progress session that is past the 48h or 96h reminder threshold
/// and still has the matching `reminder*SentAt` column null. The cron
/// consumes this shape directly. When both thresholds are due (e.g. cron
/// caught up after an outage), `threshold` is set to '96h' so the caller
/// sends one email at the longer threshold rather than two back to back.
export interface StaleReviewSession {
  sessionId: string
  /// Always set in practice: the reminder query is client-only (it filters
  /// on `magicLink`), but the column is nullable on the model now.
  magicLinkId: string | null
  reviewerId: string | null
  startedAt: Date
  threshold: '48h' | '96h'
  reminder48hSentAt: Date | null
  reminder96hSentAt: Date | null
}

export interface FindStaleInProgressSessionsOptions {
  /// Override "now" for tests. Defaults to `new Date()`.
  now?: Date
}

/**
 * Returns every in_progress review session whose `startedAt` is past the
 * 48h or 96h reminder threshold and whose corresponding `reminder*SentAt`
 * column is still null. Excludes sessions on revoked or expired magic
 * links, since those cannot be resumed.
 *
 * Used exclusively by the sendReviewReminders cron. The repository owns
 * the SQL so the job orchestrator stays a pure mapping of stale sessions
 * to email sends.
 *
 * Spec: projects/relay-app/2026-05-19-reviewer-reminder-cron-design.md
 */
export async function findStaleInProgressSessions(
  options: FindStaleInProgressSessionsOptions = {},
): Promise<StaleReviewSession[]> {
  const now = options.now ?? new Date()
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const cutoff96h = new Date(now.getTime() - 96 * 60 * 60 * 1000)

  const rows = await db.reviewSession.findMany({
    where: {
      // Reminder emails are client-only; internal (AM) sessions get the
      // in-app bell, not email.
      kind: 'client',
      status: 'in_progress',
      magicLink: {
        revokedAt: null,
        expiresAt: { gt: now },
      },
      OR: [
        { startedAt: { lt: cutoff48h }, reminder48hSentAt: null },
        { startedAt: { lt: cutoff96h }, reminder96hSentAt: null },
      ],
    },
    select: {
      id: true,
      magicLinkId: true,
      reviewerId: true,
      startedAt: true,
      reminder48hSentAt: true,
      reminder96hSentAt: true,
    },
  })

  return rows.map((r) => {
    const past96h = r.startedAt < cutoff96h && r.reminder96hSentAt === null
    const threshold: '48h' | '96h' = past96h ? '96h' : '48h'
    return {
      sessionId: r.id,
      magicLinkId: r.magicLinkId,
      reviewerId: r.reviewerId,
      startedAt: r.startedAt,
      threshold,
      reminder48hSentAt: r.reminder48hSentAt,
      reminder96hSentAt: r.reminder96hSentAt,
    }
  })
}
