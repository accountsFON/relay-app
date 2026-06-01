/**
 * sendReviewReminders , Trigger.dev daily cron.
 *
 * Emails reviewers who started a v2 review session but never submitted,
 * at 48h and 96h after `ReviewSession.startedAt`. Two nudges per session
 * then stop. AM personalized, progress aware, mirrors the existing
 * notifyImpendingPurge cron shape.
 *
 * Spec: projects/relay-app/2026-05-19-reviewer-reminder-cron-design.md
 */

import { schedules, logger } from '@trigger.dev/sdk/v3'
import { db } from '@/db/client'
import { findStaleInProgressSessions } from '@/server/repositories/reviewSessions'
import { sendEmail } from '@/lib/resend'
import { signToken } from '@/lib/magic-link'
import { ReviewSessionReminderEmail } from '@/server/emails/ReviewSessionReminderEmail'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendRemindersResult {
  remindersSent: number
  errors: number
}

export interface SendRemindersOptions {
  /// Override "now" for tests. Defaults to `new Date()`.
  now?: Date
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appBaseUrl(): string {
  // Matches sendMagicLinkEmail wiring: NEXT_PUBLIC_APP_URL is set in Vercel
  // project env (prod + previews). Falls back to the prod host so a misconfig
  // does not produce a broken link.
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://relay-app-xi.vercel.app'
}

// ---------------------------------------------------------------------------
// Pure runner, exported so unit tests can call it without invoking the
// Trigger.dev harness.
// ---------------------------------------------------------------------------

export async function runSendReviewReminders(
  options: SendRemindersOptions = {},
): Promise<SendRemindersResult> {
  const now = options.now ?? new Date()
  const stale = await findStaleInProgressSessions({ now })

  let remindersSent = 0
  let errors = 0

  for (const session of stale) {
    try {
      if (!session.reviewerId) {
        // status='in_progress' implies identity was confirmed, but defend
        // against the case where the reviewer row was unlinked between
        // ticks (e.g. magic link reset).
        logger.warn('[sendReviewReminders] session has no reviewerId, skipping', {
          sessionId: session.sessionId,
        })
        errors += 1
        continue
      }

      // Per send context: one round trip per session. At expected volumes
      // (single digit per day) this is fine; if we ever back up to dozens
      // per tick we can batch the lookups.
      const magicLink = await db.magicLink.findUnique({
        where: { id: session.magicLinkId },
        include: {
          batch: {
            select: {
              id: true,
              label: true,
              client: { select: { name: true } },
            },
          },
          creator: { select: { id: true, name: true, email: true } },
        },
      })
      if (!magicLink || !magicLink.batch || !magicLink.creator) {
        logger.warn('[sendReviewReminders] missing magic link context, skipping', {
          sessionId: session.sessionId,
          magicLinkId: session.magicLinkId,
        })
        errors += 1
        continue
      }

      const reviewer = await db.magicLinkReviewer.findUnique({
        where: { id: session.reviewerId },
        select: { id: true, name: true, email: true },
      })
      if (!reviewer || !reviewer.email) {
        // Reviewer never supplied an email on the confirm step (optional
        // field). No way to nudge; log and skip. Count as an error so the
        // Trigger.dev observability surface flags it.
        logger.warn('[sendReviewReminders] reviewer row missing email, skipping', {
          sessionId: session.sessionId,
          reviewerId: session.reviewerId,
        })
        errors += 1
        continue
      }

      const [reviewedCount, totalCount] = await Promise.all([
        db.reviewItem.count({
          where: {
            reviewSessionId: session.sessionId,
            decision: { not: 'not_reviewed' },
          },
        }),
        db.post.count({ where: { batchId: magicLink.batch.id } }),
      ])

      // Reconstruct the magic link URL from the deterministic signature,
      // no token storage needed.
      const token = signToken({
        magicLinkId: magicLink.id,
        expiresAt: magicLink.expiresAt.getTime(),
      })
      const reviewUrl = `${appBaseUrl()}/review/${token}`

      const clientName = magicLink.batch.client.name
      const batchLabel = magicLink.batch.label

      const subject =
        session.threshold === '48h'
          ? `Reminder: finish your review of ${clientName}'s ${batchLabel} posts`
          : `Still here when you're ready: ${clientName}'s ${batchLabel} posts`

      await sendEmail({
        to: reviewer.email,
        subject,
        replyTo: magicLink.creator.email,
        react: ReviewSessionReminderEmail({
          reviewerName: reviewer.name,
          clientName,
          batchLabel,
          amName: magicLink.creator.name,
          reviewedCount,
          totalCount,
          reviewUrl,
          threshold: session.threshold,
        }),
      })

      // Persist the timestamp on the matching column so the next tick
      // does not re-send. On a 96h threshold we leave the 48h column
      // alone (it stayed null because the cron caught up after an
      // outage); the column tracks "did we ever send this threshold's
      // nudge", not "should we send another".
      await db.reviewSession.update({
        where: { id: session.sessionId },
        data:
          session.threshold === '96h'
            ? { reminder96hSentAt: now }
            : { reminder48hSentAt: now },
      })

      remindersSent += 1
      logger.info('[sendReviewReminders] sent', {
        sessionId: session.sessionId,
        threshold: session.threshold,
        to: reviewer.email,
      })
    } catch (err) {
      errors += 1
      logger.error('[sendReviewReminders] send failed', {
        sessionId: session.sessionId,
        threshold: session.threshold,
        error: err instanceof Error ? err.message : String(err),
      })
      // Don't update the column on failure, next tick retries.
    }
  }

  return { remindersSent, errors }
}

// ---------------------------------------------------------------------------
// Trigger.dev scheduled task wrapper
// ---------------------------------------------------------------------------

export const sendReviewRemindersTask = schedules.task({
  id: 'send-review-reminders',
  cron: '0 14 * * *', // daily at 14:00 UTC (~10am ET, ~7am PT)
  run: () => runSendReviewReminders({}),
})
