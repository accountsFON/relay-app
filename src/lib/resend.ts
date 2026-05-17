/**
 * Resend SDK wrapper for product transactional email.
 *
 * v2 of the review session redesign moves all client-facing transactional
 * email (magic link invites, review submission digests, future reminders)
 * onto Resend with the `mail.fonbuild.com` domain. The fon-email Cloudflare
 * Worker stays in place for AM personal outreach (different reputation
 * pool, different mailbox).
 *
 * This module is intentionally a thin wrapper: it owns env reading,
 * client construction, and shape normalization. Per-template logic lives
 * next to each React Email component under `src/server/emails/`.
 *
 * Env (read lazily inside `sendEmail`, NOT at module load, so the build
 * does not fail when these are absent — production envs live in Vercel):
 *   RESEND_API_KEY     — send-only API key
 *   RESEND_FROM_EMAIL  — e.g. `reviews@mail.fonbuild.com`
 *
 * If either env is missing at call time, throw a clear error rather than
 * silently no-op'ing. Silent email failure is worse than a loud server
 * error the AM sees in the UI.
 */
import type { ReactElement } from 'react'
import { Resend } from 'resend'

export interface SendEmailInput {
  to: string
  subject: string
  /**
   * A React Email component instance. The Resend SDK accepts a React
   * node directly under the `react` field and handles HTML + plain-text
   * rendering server-side.
   */
  react: ReactElement
  /**
   * Optional reply-to address. For client-facing emails this is the AM's
   * actual inbox so reply-in-Gmail just works. Omit to let replies bounce
   * back to the From address (rarely what you want).
   */
  replyTo?: string
}

export interface SendEmailResult {
  /** Resend's email id, suitable for storage + webhook correlation. */
  id: string
}

function getEnv(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Configure it in Vercel project env (Sensitive) and `.env.local`.',
    )
  }
  if (!from) {
    throw new Error(
      'RESEND_FROM_EMAIL is not set. Configure it in Vercel project env (e.g. `reviews@mail.fonbuild.com`) and `.env.local`.',
    )
  }

  return { apiKey, from }
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const { apiKey, from } = getEnv()
  const client = new Resend(apiKey)

  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    react,
    ...(replyTo ? { replyTo } : {}),
  })

  if (error) {
    throw new Error(
      `Resend send failed: ${error.message ?? 'unknown error'} (${error.name ?? 'unknown'})`,
    )
  }

  if (!data?.id) {
    throw new Error('Resend send returned no data + no error; check SDK behavior.')
  }

  return { id: data.id }
}
