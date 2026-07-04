/**
 * notifyHolderOfBatonHandoff , emails the new holder when a relay's baton
 * passes to them (forward Pass Baton or Send Back). The in-app bell already
 * fires via recordActivity; this adds the email so an off-app holder learns
 * it's their turn , the point Caleb raised for send-backs (they land outside
 * the normal forward flow), extended to forward passes too.
 *
 * Called from the ACTION layer AFTER the baton service transaction commits
 * (never inside the tx , a rolled-back pass must not leave a sent email).
 * Best effort: every failure is swallowed and logged so a mail hiccup never
 * breaks the pass. Awaited by the caller because unawaited promises can be
 * killed when a serverless action returns.
 *
 * Skips when:
 *   - there is no new holder, or the new holder is the actor (you don't
 *     email yourself , mirrors mentionsExcludingActor on the bell);
 *   - the new holder is a client-role user (clients are notified via the
 *     magic-link review invite, not this internal "it's your turn" email);
 *   - the new holder has no email on file.
 */

import { db } from '@/db/client'
import { relayStepLabel } from '@/lib/relay-step-labels'
import { sendRelayHandoffEmail } from '@/server/services/sendRelayHandoffEmail'
import type { RelayStep } from '@prisma/client'

function appBaseUrl(): string {
  // Matches sendMagicLinkEmail / sendReviewReminders wiring. Falls back to
  // the prod host so a missing NEXT_PUBLIC_APP_URL never emits localhost
  // links in prod (see the WORKLOG follow-up to set it explicitly).
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://relay-app-xi.vercel.app'
}

export interface NotifyHolderOfBatonHandoffInput {
  batchId: string
  clientId: string
  /** The user the baton passed to (RelayEvent newHolderId). */
  newHolderId: string | null | undefined
  /** The user who performed the pass / send-back. */
  actorId: string
  /** The step the relay is now on. */
  toStep: RelayStep
  direction: 'forward' | 'back'
  /** Send-back reason, if any. */
  reason?: string
}

export async function notifyHolderOfBatonHandoff(
  input: NotifyHolderOfBatonHandoffInput,
): Promise<void> {
  try {
    const { newHolderId, actorId } = input
    if (!newHolderId || newHolderId === actorId) return

    const [recipient, actor, batch] = await Promise.all([
      db.user.findUnique({
        where: { id: newHolderId },
        select: { email: true, name: true, role: true },
      }),
      db.user.findUnique({
        where: { id: actorId },
        select: { email: true, name: true },
      }),
      db.batch.findUnique({
        where: { id: input.batchId },
        select: { label: true, client: { select: { name: true } } },
      }),
    ])

    // Clients are reached through the magic-link review invite, not this
    // internal handoff email. Skip missing users / emails too.
    if (!recipient || !recipient.email || recipient.role === 'client') return
    if (!batch) return

    await sendRelayHandoffEmail({
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      actorName: actor?.name ?? 'A teammate',
      actorEmail: actor?.email ?? '',
      clientName: batch.client?.name ?? 'your client',
      batchLabel: batch.label,
      stepLabel: relayStepLabel(input.toStep),
      direction: input.direction,
      reason: input.reason,
      relayUrl: `${appBaseUrl()}/clients/${input.clientId}/batches/${input.batchId}`,
    })
  } catch (err) {
    console.error('[notifyHolderOfBatonHandoff] failed', err)
  }
}
