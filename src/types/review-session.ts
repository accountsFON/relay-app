/**
 * Shared TypeScript types for the v2 client review session redesign.
 *
 * These mirror the Prisma `ReviewDecision` and `ReviewSessionStatus` enums
 * but are exported as string literal types so downstream layers (UI,
 * services, email templates, API routes) can import them without pulling in
 * the full Prisma client.
 *
 * The hydrated shapes (`ReviewSessionWithItems`, `ReviewItemHydrated`) are
 * the canonical return shape from the Layer 1 repository
 * (`reviewSessions.findSessionWithItems`) and feed every consumer: the
 * client review surface, the AM-side detail page, and the digest email
 * template.
 */

export type ReviewDecisionType =
  | 'not_reviewed'
  | 'approved'
  | 'changes_requested'
  | 'caption_edited'

export type ReviewSessionStatusType = 'in_progress' | 'submitted' | 'superseded'

export interface ReviewSessionSummary {
  approved: number
  changesRequested: number
  captionEdited: number
  totalPosts: number
}

/// Shape returned by reviewSessions.findSessionWithItems for both the
/// client-facing review surface and the AM-side detail page.
export interface ReviewSessionWithItems {
  id: string
  /// 'client' (magic-link reviewer) or 'internal' (Clerk-user / AM reviewer).
  /// See 2026-06-29 internal review parity.
  kind: 'client' | 'internal'
  /// Direct FK to the batch (set for both kinds). The read-back page reaches
  /// the batch via this directly for internal sessions (the old magicLink
  /// join only works for client sessions).
  batchId: string
  /// Null for internal (Clerk-user) sessions; set for client (magic-link)
  /// sessions. See 2026-06-29 internal review parity.
  magicLinkId: string | null
  reviewerId: string | null
  /// The Clerk-user (AM) reviewer for internal sessions; null for client.
  reviewerUserId: string | null
  status: ReviewSessionStatusType
  round: number
  startedAt: Date
  submittedAt: Date | null
  submittedSummary: ReviewSessionSummary | null
  items: ReviewItemHydrated[]
}

export interface ReviewItemHydrated {
  id: string
  postId: string
  decision: ReviewDecisionType
  comment: string | null
  suggestedCaption: string | null
  acceptedAsPostVersionId: string | null
  updatedSinceLastReview: boolean
  lastReviewedVersionId: string | null
  reviewedAt: Date | null
  addressedAt: Date | null
  noteResolvedAt: Date | null
}
