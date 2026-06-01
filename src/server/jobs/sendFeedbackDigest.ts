/**
 * sendFeedbackDigest , Trigger.dev weekly cron.
 *
 * Mondays at 13:00 UTC (8am EST in winter, 9am EDT in summer , see
 * active-notes for the 1h DST drift call). Pulls every Feedback row
 * with sentInDigestAt null, groups by severity, sends one email per
 * admin recipient (User.role = 'admin' OR User.platformOwner = true),
 * then stamps sentInDigestAt on every included row.
 *
 * Skips the send entirely if zero undigested rows. No "nothing new
 * this week" spam.
 *
 * Mirrors the sendReviewReminders cron shape so the orchestrator stays
 * a thin mapping of repo output to email sends.
 *
 * Spec: projects/relay-app/2026-06-01-phase-5-item-27-feedback-channel-recommendation.md
 */
import { schedules, logger } from '@trigger.dev/sdk/v3'
import { findUndigested, markDigested } from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { sendEmail } from '@/lib/resend'
import { FeedbackDigestEmail } from '@/server/emails/FeedbackDigestEmail'
import type { FeedbackSeverity } from '@prisma/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendFeedbackDigestResult {
  itemsIncluded: number
  recipientsEmailed: number
  errors: number
}

export interface SendFeedbackDigestOptions {
  /// Override "now" for tests. Defaults to `new Date()`.
  now?: Date
}

// Severity ordering used both for grouping and for the email body so the
// stamp + render order match.
const SEVERITY_ORDER: FeedbackSeverity[] = ['high', 'medium', 'low']

// ---------------------------------------------------------------------------
// Pure runner, exported so unit tests can call it without invoking the
// Trigger.dev harness.
// ---------------------------------------------------------------------------

export async function runSendFeedbackDigest(
  options: SendFeedbackDigestOptions = {},
): Promise<SendFeedbackDigestResult> {
  const now = options.now ?? new Date()

  const undigested = await findUndigested()
  if (undigested.length === 0) {
    logger.info('[sendFeedbackDigest] no undigested feedback, skipping send')
    return { itemsIncluded: 0, recipientsEmailed: 0, errors: 0 }
  }

  const recipients = await findAdminRecipients()
  if (recipients.length === 0) {
    // Defensive: should not happen in practice (at least one platform
    // owner always exists). Log loudly + skip rather than crash.
    logger.warn('[sendFeedbackDigest] no admin recipients found, skipping send', {
      itemsPending: undigested.length,
    })
    return { itemsIncluded: 0, recipientsEmailed: 0, errors: 0 }
  }

  // Group + order: severity-major (high first), createdAt ascending
  // within group. Items returned by the repo are already ascending by
  // createdAt; we just bucket by severity here.
  const bySeverity = new Map<FeedbackSeverity, typeof undigested>()
  for (const sev of SEVERITY_ORDER) bySeverity.set(sev, [])
  for (const item of undigested) {
    bySeverity.get(item.severity)?.push(item)
  }
  const orderedItems = SEVERITY_ORDER.flatMap((sev) => bySeverity.get(sev) ?? [])

  const renderItems = orderedItems.map((it) => ({
    id: it.id,
    severity: it.severity,
    bodyText: it.bodyText,
    createdAt: it.createdAt,
    submitterName: it.submitter.name,
    submitterEmail: it.submitter.email,
  }))

  // Digest window is the 7 days ending at "now". Used for the intro
  // line only; the actual query is sentInDigestAt = null so an item
  // that languished past 7d (cron outage) still rolls into the next
  // send.
  const windowEnd = now
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const subject = `Weekly Relay feedback digest (${orderedItems.length} item${
    orderedItems.length === 1 ? '' : 's'
  })`

  let recipientsEmailed = 0
  let errors = 0

  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject,
        react: FeedbackDigestEmail({
          totalCount: orderedItems.length,
          windowStart,
          windowEnd,
          items: renderItems,
        }),
      })
      recipientsEmailed += 1
      logger.info('[sendFeedbackDigest] sent', {
        to: recipient.email,
        items: orderedItems.length,
      })
    } catch (err) {
      errors += 1
      logger.error('[sendFeedbackDigest] send failed', {
        to: recipient.email,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Stamp every included row regardless of which recipient sends
  // failed. The alternative (only stamp when every recipient succeeds)
  // would re-spam the recipients that did get the email when the cron
  // retries. Resend failures are surfaced through Trigger.dev's
  // observability so a partial failure is noticed and re-driven
  // manually if needed.
  if (recipientsEmailed > 0) {
    await markDigested({
      ids: orderedItems.map((it) => it.id),
      at: now,
    })
  }

  return {
    itemsIncluded: orderedItems.length,
    recipientsEmailed,
    errors,
  }
}

// ---------------------------------------------------------------------------
// Trigger.dev scheduled task wrapper
// ---------------------------------------------------------------------------

export const sendFeedbackDigestTask = schedules.task({
  id: 'send-feedback-digest',
  // Monday 13:00 UTC. EST winter: 8am. EDT summer: 9am. Acceptable 1h
  // DST drift for an internal weekly digest; flagged in active-notes.
  cron: '0 13 * * 1',
  run: () => runSendFeedbackDigest({}),
})
