/**
 * sendNotificationRollupEmail, Resend + React Email transport for the five
 * minute notification rollup. Mirrors sendRelayHandoffEmail.
 *
 * Deliberately NO reply-to: a rollup can contain several different actors, so
 * there is no honest single address to reply to. Replies land on the
 * unmonitored noreply From, which is correct for this one.
 *
 * Throws on Resend failure. The sweep catches it and releases the claim so a
 * later tap retries the same mentions.
 */

import { createElement } from 'react'
import { sendEmail } from '@/lib/resend'
import { NotificationRollupEmail } from '@/server/emails/NotificationRollupEmail'
import {
  buildRollupSubject,
  type RollupEmailContent,
} from '@/lib/notification-email-rollup'

export interface SendNotificationRollupEmailInput {
  recipientName: string
  recipientEmail: string
  content: RollupEmailContent
  /// Fully qualified URL to the recipient's Relay inbox.
  inboxUrl: string
}

export async function sendNotificationRollupEmail(
  input: SendNotificationRollupEmailInput,
): Promise<{ messageId: string }> {
  const result = await sendEmail({
    to: input.recipientEmail,
    subject: buildRollupSubject(input.content),
    react: createElement(NotificationRollupEmail, {
      recipientName: input.recipientName,
      content: input.content,
      inboxUrl: input.inboxUrl,
    }),
  })
  return { messageId: result.id }
}
