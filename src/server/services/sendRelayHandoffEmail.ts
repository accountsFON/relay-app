/**
 * sendRelayHandoffEmail , Resend SDK + React Email transport for the
 * "a relay was handed to you" notification. Composes RelayHandoffEmail and
 * hands it to the shared `sendEmail` wrapper in `src/lib/resend.ts`.
 *
 * Mirrors sendMagicLinkEmail. Reply-To is set to the acting user's email so
 * the recipient can reply straight to whoever passed / sent it back.
 *
 * Throws on Resend failure; the caller (notifyHolderOfBatonHandoff) swallows
 * so a mail hiccup never breaks the baton pass.
 */

import { createElement } from 'react'
import { sendEmail } from '@/lib/resend'
import { RelayHandoffEmail } from '@/server/emails/RelayHandoffEmail'

export interface SendRelayHandoffEmailInput {
  recipientName: string
  recipientEmail: string
  /// Person who passed / sent it back. Used in the body + as reply-to.
  actorName: string
  actorEmail: string
  clientName: string
  /// Display label like "May 2026".
  batchLabel: string
  /// Human step label the relay is now on, e.g. "Initial Design".
  stepLabel: string
  direction: 'forward' | 'back'
  /// Send-back reason. Only for `direction: 'back'`.
  reason?: string
  /// Fully qualified relay URL.
  relayUrl: string
}

export interface SendRelayHandoffEmailResult {
  messageId: string | null
}

export function buildSubject(
  direction: 'forward' | 'back',
  clientName: string,
  batchLabel: string,
  stepLabel: string,
): string {
  return direction === 'back'
    ? `[Relay] ${clientName} ${batchLabel} sent back for re-review (${stepLabel})`
    : `[Relay] ${clientName} ${batchLabel} is now with you (${stepLabel})`
}

export async function sendRelayHandoffEmail(
  input: SendRelayHandoffEmailInput,
): Promise<SendRelayHandoffEmailResult> {
  const subject = buildSubject(
    input.direction,
    input.clientName,
    input.batchLabel,
    input.stepLabel,
  )

  try {
    const result = await sendEmail({
      to: input.recipientEmail,
      subject,
      replyTo: input.actorEmail || undefined,
      react: createElement(RelayHandoffEmail, {
        recipientName: input.recipientName,
        actorName: input.actorName,
        clientName: input.clientName,
        batchLabel: input.batchLabel,
        stepLabel: input.stepLabel,
        direction: input.direction,
        reason: input.reason,
        relayUrl: input.relayUrl,
      }),
    })

    return { messageId: result.id }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`sendRelayHandoffEmail: Resend send failed , ${detail}`)
  }
}
