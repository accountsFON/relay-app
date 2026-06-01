/**
 * Feedback repository (Phase 5 item 27, in app "Report a bug").
 *
 * Persistence layer for the in app feedback channel. Submissions land
 * here from `submitFeedbackAction`; the weekly digest cron
 * (`sendFeedbackDigest`) reads via `findUndigested` and stamps
 * `sentInDigestAt` in bulk via `markDigested`.
 *
 * No org scoping: feedback is operational data routed to platform
 * admins, not tenant scoped content. The action layer owns auth
 * (signed in user only).
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */
import { db } from '@/db/client'
import type { Feedback, FeedbackSeverity } from '@prisma/client'

// ---- Row aliases ----

/// Bare Prisma row.
export type FeedbackRow = Feedback

/// Feedback hydrated with the submitter's display name + email, the
/// shape the digest email needs to render each item.
export interface FeedbackWithSubmitter {
  id: string
  bodyText: string
  severity: FeedbackSeverity
  createdAt: Date
  sentInDigestAt: Date | null
  sentUrgentAt: Date | null
  submitter: {
    id: string
    name: string
    email: string
  }
}

// ---- Public API ----

export interface CreateFeedbackInput {
  userId: string
  bodyText: string
  severity: FeedbackSeverity
}

/**
 * Insert a new Feedback row. Caller is responsible for trimming /
 * validating bodyText (the action layer does this with Zod). Returns
 * the inserted row so the caller can branch on severity for the urgent
 * email path without re-reading.
 */
export async function createFeedback(
  input: CreateFeedbackInput,
): Promise<FeedbackRow> {
  return db.feedback.create({
    data: {
      userId: input.userId,
      bodyText: input.bodyText,
      severity: input.severity,
    },
  })
}

/**
 * Returns every Feedback row that has not yet been included in a
 * weekly digest, hydrated with submitter info. Includes urgent rows
 * (severity = high) by design: the urgent email is a real time alert,
 * not a "handled" marker, so the same row still rolls into the next
 * digest for traceability.
 *
 * Ordered by createdAt ascending so the digest reads chronologically.
 */
export async function findUndigested(): Promise<FeedbackWithSubmitter[]> {
  const rows = await db.feedback.findMany({
    where: { sentInDigestAt: null },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    bodyText: r.bodyText,
    severity: r.severity,
    createdAt: r.createdAt,
    sentInDigestAt: r.sentInDigestAt,
    sentUrgentAt: r.sentUrgentAt,
    submitter: {
      id: r.user.id,
      name: r.user.name,
      email: r.user.email,
    },
  }))
}

export interface MarkDigestedInput {
  ids: string[]
  at: Date
}

/**
 * Bulk stamp `sentInDigestAt` on every passed id. Called by the cron
 * after a successful Resend send so the next tick does not re-include
 * the same rows. No-op when `ids` is empty.
 */
export async function markDigested(input: MarkDigestedInput): Promise<void> {
  if (input.ids.length === 0) return
  await db.feedback.updateMany({
    where: { id: { in: input.ids } },
    data: { sentInDigestAt: input.at },
  })
}

export interface MarkUrgentSentInput {
  id: string
  at: Date
}

/**
 * Stamp `sentUrgentAt` on a single row after the urgent email send
 * succeeds. Independent of digest tracking, the same row gets both
 * timestamps over its lifetime.
 */
export async function markUrgentSent(input: MarkUrgentSentInput): Promise<void> {
  await db.feedback.update({
    where: { id: input.id },
    data: { sentUrgentAt: input.at },
  })
}
