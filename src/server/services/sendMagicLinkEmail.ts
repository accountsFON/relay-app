/**
 * sendMagicLinkEmail , Resend SDK + React Email transport.
 *
 * v2 of the review session redesign moves all client-facing transactional
 * email onto Resend with the `mail.fonbuild.com` domain. This service
 * composes the MagicLinkInviteEmail React template and hands it to the
 * shared `sendEmail` wrapper in `src/lib/resend.ts`.
 *
 * External signature is intentionally unchanged from the v1 fon-email
 * Worker implementation so existing callers (magicLink server actions,
 * future reminder jobs) keep working without modification.
 *
 * No retries here: the calling action surfaces failure to the AM (UI
 * shows "link created but email failed" and the AM can copy the URL
 * manually). Adding retries before that escape hatch exists would mask
 * misconfiguration during the rollout window.
 *
 * Reply-To is intentionally NOT set here. The Resend default routes
 * replies back to the From address. When AMs need direct-reply routing
 * we can pass the AM's email via the input and set replyTo accordingly.
 */

import { createElement } from 'react'
import { sendEmail } from '@/lib/resend'
import { MagicLinkInviteEmail } from '@/server/emails/MagicLinkInviteEmail'

export interface SendMagicLinkEmailInput {
  recipientName: string
  recipientEmail: string
  /** AM's name; used in the greeting and footer signature. */
  senderName: string
  clientName: string
  /** YYYY-MM display string, e.g. "May 2026". */
  monthLabel: string
  /** Fully-qualified review URL the AM just generated. */
  reviewUrl: string
  expiresAt: Date
  /** White-label agency branding (P2 #21); all optional, null → the FON look. */
  brandName?: string
  brandLogoUrl?: string | null
  brandColor?: string | null
}

export interface SendMagicLinkEmailResult {
  messageId: string | null
}

/** White-label-neutral subject (P2 #21): no agency-specific prefix. */
export function buildSubject(clientName: string, monthLabel: string): string {
  return `Review your social posts — ${clientName} ${monthLabel}`
}

export async function sendMagicLinkEmail(
  input: SendMagicLinkEmailInput,
): Promise<SendMagicLinkEmailResult> {
  const subject = buildSubject(input.clientName, input.monthLabel)

  try {
    const result = await sendEmail({
      to: input.recipientEmail,
      subject,
      react: createElement(MagicLinkInviteEmail, {
        recipientName: input.recipientName,
        clientName: input.clientName,
        monthLabel: input.monthLabel,
        reviewUrl: input.reviewUrl,
        senderName: input.senderName,
        expiresAt: input.expiresAt,
        brandName: input.brandName,
        brandLogoUrl: input.brandLogoUrl,
        brandColor: input.brandColor,
      }),
    })

    return { messageId: result.id }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`sendMagicLinkEmail: Resend send failed , ${detail}`)
  }
}
