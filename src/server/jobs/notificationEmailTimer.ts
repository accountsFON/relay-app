/**
 * notification-email-timer, tapper two for notification rollup emails.
 *
 * Scheduled by recordActivity with a five minute delay whenever mentions are
 * created, and deduped by an idempotency key bucketed to the current window,
 * so a burst of twenty mentions produces ONE delayed run.
 *
 * The run carries no payload. It is a bare "go look at the pile" nudge, which
 * is what makes it safe to schedule from inside a transaction: if that
 * transaction rolls back, this wakes up, finds nothing due, and stops.
 *
 * maxRecipients is generous here because this run has no request to keep
 * fast, unlike the bell poll tapper.
 */
import { logger, task } from '@trigger.dev/sdk/v3'
import { notificationEmailTick } from '@/server/services/notificationEmailTick'

export const notificationEmailTimerTask = task({
  id: 'notification-email-timer',
  run: async () => {
    const result = await notificationEmailTick({ maxRecipients: 100 })
    logger.info('[notification-email-timer] swept', {
      result: result ?? 'nothing due',
    })
    return result
  },
})
