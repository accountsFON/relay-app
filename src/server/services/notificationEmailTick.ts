/**
 * notificationEmailTick, the composition root for notification rollup email.
 *
 * Both tappers call this and nothing else: the notification bell poll route
 * and the Trigger.dev delayed run. They fail for different reasons (one needs
 * a human signed in, the other needs Trigger.dev healthy), and either one
 * alone sends the whole pile correctly.
 *
 * The probe runs first because this is called on every bell poll, every 20
 * seconds, by every signed in user. Almost every call finds nothing and
 * returns after one indexed lookup.
 *
 * MUST NOT throw. A notification email problem can never be allowed to break
 * the notification bell.
 */
import {
  anyMentionDueForEmail,
  listMentionsDueForEmail,
  claimMentionsForEmail,
  releaseMentionsForEmail,
} from '@/server/repositories/activityEvents'
import { sendNotificationRollupEmail } from '@/server/services/sendNotificationRollupEmail'
import {
  runNotificationEmailSweep,
  type SweepResult,
} from '@/server/services/notificationEmailSweep'

function appBaseUrl(): string {
  // Matches sendMagicLinkEmail / notifyHolderOfBatonHandoff wiring. The
  // fallback keeps prod links working while NEXT_PUBLIC_APP_URL is unset.
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://relay-app-xi.vercel.app'
}

export async function notificationEmailTick(opts?: {
  now?: Date
  maxRecipients?: number
}): Promise<SweepResult | null> {
  const now = opts?.now ?? new Date()
  try {
    if (!(await anyMentionDueForEmail(now))) return null

    return await runNotificationEmailSweep(
      { now, maxRecipients: opts?.maxRecipients },
      {
        listDue: listMentionsDueForEmail,
        claim: claimMentionsForEmail,
        release: releaseMentionsForEmail,
        send: sendNotificationRollupEmail,
        baseUrl: appBaseUrl(),
      },
    )
  } catch (err) {
    console.error('[notificationEmailTick] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
