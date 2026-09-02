/**
 * notificationEmailSweep, turns the pile of unread, unemailed mentions into
 * one rollup email per person.
 *
 * Dependencies are injected (the autoFlagClientPins pattern) so every branch
 * is unit testable without a database or a live Resend key.
 *
 * Claim before send. Stamping emailedAt IS the claim, so two sweeps running
 * at once cannot both send the same mentions, and no lock is needed. A send
 * that fails releases its claim so a later tap retries it. The trade is that
 * a hard process death between claim and send drops that one email; the bell
 * notification is untouched and still shows it.
 */
import { buildRollupContent } from '@/lib/notification-email-rollup'
import type { DueMentionRow } from '@/server/repositories/activityEvents'
import type { SendNotificationRollupEmailInput } from '@/server/services/sendNotificationRollupEmail'

export interface SweepDeps {
  listDue: (now: Date) => Promise<DueMentionRow[]>
  claim: (mentionIds: string[], at: Date) => Promise<string[]>
  release: (mentionIds: string[]) => Promise<void>
  send: (input: SendNotificationRollupEmailInput) => Promise<unknown>
  baseUrl: string
}

export interface SweepResult {
  /**
   * Recipients CONSIDERED this tap, up to maxRecipients. Includes any
   * recipient skipped because their claim came back empty (every mention of
   * theirs was already claimed by a concurrent sweep), not only the ones an
   * email actually went out to.
   */
  recipients: number
  emailsSent: number
  mentionsEmailed: number
  failures: number
}

export async function runNotificationEmailSweep(
  opts: { now?: Date; maxRecipients?: number },
  deps: SweepDeps,
): Promise<SweepResult> {
  const now = opts.now ?? new Date()
  const maxRecipients = opts.maxRecipients ?? 25

  const due = await deps.listDue(now)
  if (due.length === 0) {
    return { recipients: 0, emailsSent: 0, mentionsEmailed: 0, failures: 0 }
  }

  const byRecipient = new Map<string, DueMentionRow[]>()
  for (const row of due) {
    const bucket = byRecipient.get(row.recipient.id)
    if (bucket) bucket.push(row)
    else byRecipient.set(row.recipient.id, [row])
  }

  const batches = [...byRecipient.values()].slice(0, maxRecipients)

  let emailsSent = 0
  let mentionsEmailed = 0
  let failures = 0

  for (const rows of batches) {
    const recipient = rows[0].recipient

    // Claim first. Whoever wins the update owns these mentions for this tap.
    // Guarded on its own: a claim failure (db blip, deadlock, pool
    // exhaustion) must not abort the whole sweep and take every remaining
    // recipient down with it.
    let claimedIds: string[]
    try {
      claimedIds = await deps.claim(
        rows.map((r) => r.mentionId),
        now,
      )
    } catch (err) {
      failures += 1
      console.error('[notificationEmailSweep] claim failed', {
        recipientId: recipient.id,
        items: rows.length,
        err: err instanceof Error ? err.message : String(err),
      })
      // No release here on purpose: if the claim itself threw, nothing was
      // claimed, so there is nothing to hand back.
      continue
    }
    if (claimedIds.length === 0) continue

    const claimed = new Set(claimedIds)
    const claimedRows = rows.filter((r) => claimed.has(r.mentionId))

    try {
      await deps.send({
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        content: buildRollupContent(claimedRows, deps.baseUrl),
        inboxUrl: `${deps.baseUrl}/inbox`,
      })
      emailsSent += 1
      mentionsEmailed += claimedRows.length
    } catch (err) {
      failures += 1
      console.error('[notificationEmailSweep] send failed', {
        recipientId: recipient.id,
        items: claimedRows.length,
        err: err instanceof Error ? err.message : String(err),
      })
      // Hand the mentions back so a later tap tries again. They age out of
      // the 24 hour window on their own if the address never works.
      try {
        await deps.release(claimedIds)
      } catch (releaseErr) {
        console.error('[notificationEmailSweep] release failed', {
          recipientId: recipient.id,
          err:
            releaseErr instanceof Error
              ? releaseErr.message
              : String(releaseErr),
        })
      }
    }
  }

  return {
    recipients: batches.length,
    emailsSent,
    mentionsEmailed,
    failures,
  }
}
