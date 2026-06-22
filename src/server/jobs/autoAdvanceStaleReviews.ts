/**
 * autoAdvanceStaleReviews , Trigger.dev daily cron.
 *
 * Advances relays sitting in Client Review past their org's review window to
 * Scheduling, treating client silence as approval. Per-relay opt-out via
 * Batch.autoAdvanceOnTimeout. Runs after the reminder cron so a same-day
 * reminder fires before a same-day timeout.
 *
 * Spec: projects/relay-app/2026-06-22-pipeline-rework-design.md
 */

import { schedules, logger } from '@trigger.dev/sdk/v3'
import { findStaleClientReviews } from '@/server/repositories/batches'
import { advanceFromClientReview } from '@/server/services/relay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoAdvanceResult {
  advanced: number
  errors: number
}

export interface AutoAdvanceOptions {
  /// Override "now" for tests. Defaults to `new Date()`.
  now?: Date
}

// ---------------------------------------------------------------------------
// Pure runner, exported so unit tests can call it without invoking the
// Trigger.dev harness.
// ---------------------------------------------------------------------------

export async function runAutoAdvanceStaleReviews(
  options: AutoAdvanceOptions = {},
): Promise<AutoAdvanceResult> {
  const now = options.now ?? new Date()
  const stale = await findStaleClientReviews(now)

  let advanced = 0
  let errors = 0

  for (const batch of stale) {
    try {
      const fallbackUserId = batch.client.assignedAmId
      if (!fallbackUserId) {
        logger.warn('[autoAdvanceStaleReviews] no assigned AM, skipping', { batchId: batch.id })
        errors += 1
        continue
      }

      // Treat silence as approval -> Scheduling. advanceFromClientReview is a
      // no-op if the batch already moved (it re-checks currentStep), so this is
      // safe against a same-tick manual advance. reviewSessionId is unused on
      // the approved path; pass an empty string.
      const res = await advanceFromClientReview({
        batchId: batch.id,
        decision: 'approved',
        reviewerName: null,
        fallbackUserId,
        reviewSessionId: '',
      })

      if (res.advanced) {
        advanced += 1
        logger.info('[autoAdvanceStaleReviews] advanced', { batchId: batch.id, toStep: res.toStep })
      }
    } catch (err) {
      errors += 1
      logger.error('[autoAdvanceStaleReviews] failed', {
        batchId: batch.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { advanced, errors }
}

// ---------------------------------------------------------------------------
// Trigger.dev scheduled task wrapper
// ---------------------------------------------------------------------------

export const autoAdvanceStaleReviewsTask = schedules.task({
  id: 'auto-advance-stale-reviews',
  cron: '0 15 * * *', // daily 15:00 UTC, after the 14:00 reminder cron
  run: () => runAutoAdvanceStaleReviews({}),
})
