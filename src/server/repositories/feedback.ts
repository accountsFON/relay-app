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
  pageUrl: string | null
  imageUrl: string | null
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
  /// App path the reporter was on (pathname + search), captured client-side.
  pageUrl?: string | null
  /// Vercel Blob URL of an attached screenshot.
  imageUrl?: string | null
  /// The reporter's org at submit time; scopes the admin dashboard. Null for
  /// platform-owner submitters (no active org).
  organizationId?: string | null
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
      pageUrl: input.pageUrl ?? null,
      imageUrl: input.imageUrl ?? null,
      organizationId: input.organizationId ?? null,
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
    pageUrl: r.pageUrl,
    imageUrl: r.imageUrl,
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

// ---- Admin dashboard ----

/// A feedback row hydrated for the admin dashboard: submitter, org name,
/// and who (if anyone) resolved it.
export interface FeedbackForAdmin {
  id: string
  bodyText: string
  severity: FeedbackSeverity
  createdAt: Date
  pageUrl: string | null
  imageUrl: string | null
  sentUrgentAt: Date | null
  sentInDigestAt: Date | null
  resolvedAt: Date | null
  submitter: { id: string; name: string; email: string }
  organizationName: string | null
  resolvedByName: string | null
}

/// Scope for the admin feedback list. Platform owners see every org's
/// feedback; a regular org admin sees only their own org's rows.
export interface AdminFeedbackScope {
  organizationDbId: string
  platformOwner: boolean
}

/**
 * List feedback for the admin dashboard, newest first with OPEN (unresolved)
 * rows floated above resolved ones. Platform owners see all rows; org admins
 * are scoped to their org (rows whose submitter had no org — platform-owner
 * submissions — are visible only to platform owners).
 */
export async function listFeedbackForAdmin(
  scope: AdminFeedbackScope,
): Promise<FeedbackForAdmin[]> {
  const rows = await db.feedback.findMany({
    where: scope.platformOwner
      ? undefined
      : { organizationId: scope.organizationDbId },
    orderBy: [
      { resolvedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ],
    include: {
      user: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
      resolvedBy: { select: { name: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    bodyText: r.bodyText,
    severity: r.severity,
    createdAt: r.createdAt,
    pageUrl: r.pageUrl,
    imageUrl: r.imageUrl,
    sentUrgentAt: r.sentUrgentAt,
    sentInDigestAt: r.sentInDigestAt,
    resolvedAt: r.resolvedAt,
    submitter: { id: r.user.id, name: r.user.name, email: r.user.email },
    organizationName: r.organization?.name ?? null,
    resolvedByName: r.resolvedBy?.name ?? null,
  }))
}

/// Minimal row for the resolve action's org-scope check.
export async function findFeedbackForResolve(
  id: string,
): Promise<{ id: string; organizationId: string | null } | null> {
  return db.feedback.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  })
}

export interface SetFeedbackResolvedInput {
  id: string
  resolvedById: string
  at: Date
}

/// Mark a report handled: stamp resolvedAt + who resolved it.
export async function setFeedbackResolved(
  input: SetFeedbackResolvedInput,
): Promise<void> {
  await db.feedback.update({
    where: { id: input.id },
    data: { resolvedAt: input.at, resolvedById: input.resolvedById },
  })
}

/// Reopen a report: clear resolvedAt + resolvedById.
export async function reopenFeedback(id: string): Promise<void> {
  await db.feedback.update({
    where: { id },
    data: { resolvedAt: null, resolvedById: null },
  })
}

/// Hard-delete a single ticket. Nothing references a Feedback row, so the
/// delete is clean (no cascade needed).
export async function deleteFeedback(id: string): Promise<void> {
  await db.feedback.delete({ where: { id } })
}

/**
 * Hard-delete every ticket in scope. Platform owners clear all orgs; a
 * regular org admin clears only their own org. Returns the number deleted.
 */
export async function deleteAllFeedback(
  scope: AdminFeedbackScope,
): Promise<number> {
  const result = await db.feedback.deleteMany({
    where: scope.platformOwner
      ? {}
      : { organizationId: scope.organizationDbId },
  })
  return result.count
}
