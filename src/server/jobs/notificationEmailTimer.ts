/**
 * notification-email-timer, tapper two for notification rollup emails.
 *
 * Scheduled with a five minute delay whenever mentions are created, and
 * deduped by an idempotency key bucketed to the current window, so a burst
 * of twenty mentions produces ONE delayed run. `recordActivity` schedules it
 * directly for non-transactional callers; transactional callers (a `tx` was
 * passed) schedule it themselves, post commit, via the exported
 * `scheduleNotificationEmailTimer` in `@/server/services/activity`, so the
 * Trigger.dev network call never holds an interactive Prisma transaction
 * open.
 *
 * The run carries no payload. It is a bare "go look at the pile" nudge, which
 * is what makes it safe to schedule from inside a transaction: if that
 * transaction rolls back, this wakes up, finds nothing due, and stops.
 *
 * maxRecipients is generous here because this run has no request to keep
 * fast, unlike the bell poll tapper.
 *
 * Self re-arm (Fix 1): the idempotency key that schedules a run books it for
 * the FIRST mention that opened the current bucket, firing 5 minutes after
 * THAT mention. A mention created later in the same bucket is still younger
 * than 5 minutes when this run fires, so it is not due yet and this run does
 * not touch it. Left alone, that mention would wait for the next unrelated
 * activity or someone's bell poll to ever get a run of its own, which can
 * strand it overnight, exactly the case this feature exists to cover. So
 * after every sweep this checks whether a too-young mention is still
 * pending and, if so, books itself again 5 minutes out.
 */
import { logger, task, tasks } from '@trigger.dev/sdk/v3'
import { notificationEmailTick } from '@/server/services/notificationEmailTick'
import { anyMentionPendingSoon } from '@/server/repositories/activityEvents'
import { notificationEmailTimerIdempotencyKey } from '@/server/services/activity'
import { ROLLUP_WINDOW_MS } from '@/lib/notification-email-rollup'

export const notificationEmailTimerTask = task({
  id: 'notification-email-timer',
  run: async () => {
    const result = await notificationEmailTick({ maxRecipients: 100 })
    logger.info('[notification-email-timer] swept', {
      result: result ?? 'nothing due',
    })

    await rearmIfPendingSoon()

    return result
  },
})

/**
 * Books a follow up run for the NEXT bucket when a too-young mention is
 * still waiting. Uses the same `notif-email-${bucket}` key format as the
 * ordinary schedule in `activity.ts` (via the shared
 * `notificationEmailTimerIdempotencyKey` helper) so a re-arm and any
 * ordinary scheduling that lands in that same next window collapse into one
 * run instead of two.
 *
 * Wrapped so a probe or scheduling failure can never throw out of the task;
 * the bell poll tapper is still a backstop if this is lost.
 *
 * Exported so tests can exercise it directly. Trigger.dev's `Task` type does
 * not expose `.run()` to callers, so the task wrapper above cannot be invoked
 * from a unit test the way `recordActivity` (Task 9's other tapper) is.
 */
export async function rearmIfPendingSoon(): Promise<void> {
  try {
    const now = new Date()
    if (!(await anyMentionPendingSoon(now))) return

    const nextBucket = Math.floor(now.getTime() / ROLLUP_WINDOW_MS) + 1
    await tasks.trigger(
      'notification-email-timer',
      {},
      {
        delay: '5m',
        idempotencyKey: notificationEmailTimerIdempotencyKey(nextBucket),
        idempotencyKeyTTL: '15m',
      },
    )
  } catch (err) {
    logger.error('[notification-email-timer] re-arm failed', {
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
