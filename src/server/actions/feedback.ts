'use server'

/**
 * Server actions for the in app "Report a bug" channel (Phase 5 item
 * 27). Exposed as RPCs to authenticated browsers, every export resolves
 * the actor from Clerk and rejects unauthenticated calls before
 * touching the DB.
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import {
  createFeedback,
  markUrgentSent,
  findFeedbackForResolve,
  setFeedbackResolved,
  reopenFeedback,
  deleteFeedback,
  deleteAllFeedback,
} from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { sendEmail } from '@/lib/resend'
import { FeedbackUrgentEmail } from '@/server/emails/FeedbackUrgentEmail'
import { isFeedbackImageBlobUrl } from '@/lib/feedback-image'
import { db } from '@/db/client'
import type { FeedbackSeverity } from '@prisma/client'

// 4000 chars is generous for a free-form bug report (the textarea is
// soft-capped client-side). Anything bigger is almost certainly a paste
// of a stack trace; we accept it but the Resend send will eventually
// reject if the body balloons further.
const MAX_BODY_CHARS = 4000

const MAX_URL_CHARS = 2048

const submitSchema = z.object({
  bodyText: z
    .string()
    .trim()
    .min(1, 'bodyText cannot be empty')
    .max(MAX_BODY_CHARS, `bodyText cannot exceed ${MAX_BODY_CHARS} chars`),
  severity: z.enum(['low', 'medium', 'high']),
  // App path (pathname + search) captured client-side. Free-form but capped.
  pageUrl: z.string().trim().max(MAX_URL_CHARS).optional(),
  // Optional screenshot: must be a feedback-images blob URL if present (an
  // empty string is treated as "no image").
  imageUrl: z
    .string()
    .trim()
    .max(MAX_URL_CHARS)
    .optional()
    .refine(
      (v) => v === undefined || v === '' || isFeedbackImageBlobUrl(v),
      'imageUrl must be a feedback-images blob URL',
    ),
})

export interface SubmitFeedbackInput {
  bodyText: string
  severity: FeedbackSeverity
  pageUrl?: string
  imageUrl?: string
}

export interface SubmitFeedbackResult {
  feedbackId: string
  urgentEmailSent: boolean
}

/**
 * Insert a Feedback row, then , if severity = high , fire an
 * immediate admin email and stamp sentUrgentAt. Urgent send failures
 * do not fail the action; the weekly digest still picks up the row.
 *
 * Returns the new feedback id + a flag the client can read to surface
 * "we paged the team" copy in the success toast (currently unused, but
 * cheaper to expose now than to wire up later).
 */
export async function submitFeedbackAction(
  input: SubmitFeedbackInput,
): Promise<SubmitFeedbackResult> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    throw new Error(first?.message ?? 'Invalid feedback submission')
  }

  const ctx = await requireOrgContext()

  const pageUrl = parsed.data.pageUrl ? parsed.data.pageUrl : null
  const imageUrl = parsed.data.imageUrl ? parsed.data.imageUrl : null

  const created = await createFeedback({
    userId: ctx.userDbId,
    bodyText: parsed.data.bodyText,
    severity: parsed.data.severity,
    pageUrl,
    imageUrl,
    // ctx.organizationDbId is '' for a platform owner with no active org.
    organizationId: ctx.organizationDbId || null,
  })

  let urgentEmailSent = false
  if (created.severity === 'high') {
    urgentEmailSent = await sendUrgentEmail(created.id)
  }

  return { feedbackId: created.id, urgentEmailSent }
}

/**
 * Internal: fan out a single Feedback row to every admin recipient via
 * the urgent email template, then stamp sentUrgentAt on the row.
 *
 * Returns true if at least one recipient was emailed successfully.
 * Failures are logged via console.error (the action layer does not have
 * Trigger.dev's structured logger) and swallowed, since the digest
 * still picks up the row.
 */
async function sendUrgentEmail(feedbackId: string): Promise<boolean> {
  const row = await db.feedback.findUnique({
    where: { id: feedbackId },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!row) return false

  const recipients = await findAdminRecipients()
  if (recipients.length === 0) {
    console.warn(
      '[submitFeedbackAction] urgent path skipped, no admin recipients',
    )
    return false
  }

  const subject = `[URGENT] Relay bug report from ${row.user.name}`

  let anySent = false
  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject,
        replyTo: row.user.email,
        react: FeedbackUrgentEmail({
          submitterName: row.user.name,
          submitterEmail: row.user.email,
          bodyText: row.bodyText,
          submittedAt: row.createdAt,
          pageUrl: row.pageUrl,
          imageUrl: row.imageUrl,
        }),
      })
      anySent = true
    } catch (err) {
      console.error('[submitFeedbackAction] urgent email send failed', {
        to: recipient.email,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (anySent) {
    try {
      await markUrgentSent({ id: feedbackId, at: new Date() })
    } catch (err) {
      console.error('[submitFeedbackAction] markUrgentSent failed', {
        feedbackId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return anySent
}

export interface ResolveFeedbackInput {
  feedbackId: string
  /// true = mark resolved, false = reopen.
  resolved: boolean
}

/**
 * Admin dashboard action: mark a bug report resolved (or reopen it).
 *
 * Gated on `admin.portal`. Org-scoped: a non-platform-owner admin may only
 * act on feedback from their own org; a cross-org id returns "not found" (no
 * leak). Platform owners may resolve anything.
 */
export async function resolveFeedbackAction(
  input: ResolveFeedbackInput,
): Promise<{ resolved: boolean }> {
  const ctx = await requireOrgContext()
  if (!can(ctx, 'admin.portal')) {
    throw new Error('Forbidden')
  }

  const row = await findFeedbackForResolve(input.feedbackId)
  if (!row) {
    throw new Error('Feedback not found')
  }
  if (!ctx.platformOwner && row.organizationId !== ctx.organizationDbId) {
    // Do not reveal that the row exists in another org.
    throw new Error('Feedback not found')
  }

  if (input.resolved) {
    await setFeedbackResolved({
      id: row.id,
      resolvedById: ctx.userDbId,
      at: new Date(),
    })
  } else {
    await reopenFeedback(row.id)
  }

  revalidatePath('/admin/feedback')
  return { resolved: input.resolved }
}

/**
 * Admin dashboard action: permanently delete a single ticket. Same gate +
 * org scoping as resolve (platform owners any org; org admins own org only,
 * cross-org returns "not found"). Hard delete, no undo.
 */
export async function deleteFeedbackAction(input: {
  feedbackId: string
}): Promise<{ deleted: true }> {
  const ctx = await requireOrgContext()
  if (!can(ctx, 'admin.portal')) {
    throw new Error('Forbidden')
  }

  const row = await findFeedbackForResolve(input.feedbackId)
  if (!row) {
    throw new Error('Feedback not found')
  }
  if (!ctx.platformOwner && row.organizationId !== ctx.organizationDbId) {
    throw new Error('Feedback not found')
  }

  await deleteFeedback(row.id)
  revalidatePath('/admin/feedback')
  return { deleted: true }
}

/**
 * Admin dashboard action: permanently delete every ticket in the caller's
 * scope (platform owners clear all orgs; an org admin clears only their own).
 * Hard delete, no undo. Returns the count removed.
 */
export async function deleteAllFeedbackAction(): Promise<{ count: number }> {
  const ctx = await requireOrgContext()
  if (!can(ctx, 'admin.portal')) {
    throw new Error('Forbidden')
  }

  const count = await deleteAllFeedback({
    organizationDbId: ctx.organizationDbId,
    platformOwner: ctx.platformOwner,
  })
  revalidatePath('/admin/feedback')
  return { count }
}
