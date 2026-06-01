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
import { requireOrgContext } from '@/server/middleware/auth'
import {
  createFeedback,
  markUrgentSent,
} from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { sendEmail } from '@/lib/resend'
import { FeedbackUrgentEmail } from '@/server/emails/FeedbackUrgentEmail'
import { db } from '@/db/client'
import type { FeedbackSeverity } from '@prisma/client'

// 4000 chars is generous for a free-form bug report (the textarea is
// soft-capped client-side). Anything bigger is almost certainly a paste
// of a stack trace; we accept it but the Resend send will eventually
// reject if the body balloons further.
const MAX_BODY_CHARS = 4000

const submitSchema = z.object({
  bodyText: z
    .string()
    .trim()
    .min(1, 'bodyText cannot be empty')
    .max(MAX_BODY_CHARS, `bodyText cannot exceed ${MAX_BODY_CHARS} chars`),
  severity: z.enum(['low', 'medium', 'high']),
})

export interface SubmitFeedbackInput {
  bodyText: string
  severity: FeedbackSeverity
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

  const created = await createFeedback({
    userId: ctx.userDbId,
    bodyText: parsed.data.bodyText,
    severity: parsed.data.severity,
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
