/**
 * Resend SDK wrapper for product transactional email.
 *
 * v2 of the review session redesign moves all client facing transactional
 * email (magic link invites, review submission digests, future reminders)
 * onto Resend with the `mail.fonbuild.com` domain. The fon-email Cloudflare
 * Worker stays in place for AM personal outreach (different reputation
 * pool, different mailbox).
 *
 * Deliverability defaults applied to every send:
 *   - From displays as `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
 *     defaulting to `Relay Social <noreply@mail.fonbuild.com>`. Display
 *     name in the From is the strongest signal Gmail uses to render the
 *     sender chip; without it the address shows raw.
 *   - Plain text body auto rendered from the React Email component via
 *     `@react-email/render`. Gmail and Apple Mail both downgrade messages
 *     that are HTML only; multipart/alternative is required for clean
 *     inbox placement.
 *   - `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *     headers (RFC 2369 + RFC 8058). Required by Gmail and Yahoo as of
 *     Feb 2024 for any sender doing 5k+ msg/day; not strictly required
 *     for low volume transactional but a free deliverability win and
 *     keeps us covered as volume grows.
 *   - `X-Entity-Ref-ID` set to a fresh UUID per send. Prevents Gmail
 *     from collapsing distinct transactional messages into one thread
 *     when subjects repeat (review reminders, round 2 invites).
 *
 * Per template logic lives next to each React Email component under
 * `src/server/emails/`. This wrapper owns env reading, From assembly,
 * text/HTML pairing, and header defaults.
 *
 * Env (read lazily inside `sendEmail`, NOT at module load, so the build
 * does not fail when these are absent , production envs live in Vercel):
 *   RESEND_API_KEY     , send only API key
 *   RESEND_FROM_EMAIL  , e.g. `noreply@mail.fonbuild.com`
 *   RESEND_FROM_NAME   , optional, defaults to `Relay Social`
 *   RESEND_UNSUBSCRIBE_MAILTO , optional, defaults to support@fonmarketing.com
 *
 * If RESEND_API_KEY or RESEND_FROM_EMAIL is missing at call time, throw a
 * clear error rather than silently no op'ing. Silent email failure is
 * worse than a loud server error the AM sees in the UI.
 */
import { randomUUID } from 'crypto'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import { Resend } from 'resend'

export interface SendEmailInput {
  to: string
  subject: string
  /**
   * A React Email component instance. The wrapper renders both an HTML
   * body and a plain text fallback so the message is multipart/alternative
   * by the time it leaves Resend, which is what every major MTA expects
   * for transactional mail.
   */
  react: ReactElement
  /**
   * Optional reply to address. For client facing emails this is the AM's
   * actual inbox so reply in Gmail just works. Omit to let replies land
   * on the From address (which is `noreply@...` and not monitored).
   */
  replyTo?: string
  /**
   * Optional additional headers. Wrapper defaults (List Unsubscribe,
   * X Entity Ref ID) are applied first, then merged with anything the
   * caller passes here. Caller wins on key collisions.
   */
  headers?: Record<string, string>
}

export interface SendEmailResult {
  /** Resend's email id, suitable for storage + webhook correlation. */
  id: string
}

interface ResolvedEnv {
  apiKey: string
  fromAddress: string
  fromName: string
  unsubscribeMailto: string
}

function getEnv(): ResolvedEnv {
  const apiKey = process.env.RESEND_API_KEY
  const fromAddress = process.env.RESEND_FROM_EMAIL
  const fromName = process.env.RESEND_FROM_NAME ?? 'Relay Social'
  const unsubscribeMailto =
    process.env.RESEND_UNSUBSCRIBE_MAILTO ?? 'support@fonmarketing.com'

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Configure it in Vercel project env (Sensitive) and `.env.local`.',
    )
  }
  if (!fromAddress) {
    throw new Error(
      'RESEND_FROM_EMAIL is not set. Configure it in Vercel project env (e.g. `noreply@mail.fonbuild.com`) and `.env.local`.',
    )
  }

  return { apiKey, fromAddress, fromName, unsubscribeMailto }
}

function formatFrom(name: string, address: string): string {
  // Quote the display name if it contains a comma, dot, or other RFC 5322
  // special character. `Relay Social` is safe but a defensive escape keeps
  // future renames (`Relay, Inc.` etc.) from producing malformed headers.
  const needsQuoting = /[",.;:<>@\[\]\\]/.test(name)
  const safeName = needsQuoting ? `"${name.replace(/"/g, '\\"')}"` : name
  return `${safeName} <${address}>`
}

export async function sendEmail({
  to,
  subject,
  react,
  replyTo,
  headers,
}: SendEmailInput): Promise<SendEmailResult> {
  const { apiKey, fromAddress, fromName, unsubscribeMailto } = getEnv()
  const client = new Resend(apiKey)

  // Render text fallback from the React component. `render` accepts the
  // same node type the SDK does and produces a plain text rendering using
  // the component's preview text + body structure. This makes the message
  // multipart/alternative without us hand maintaining a parallel text
  // template per email.
  const text = await render(react, { plainText: true })

  const defaultHeaders: Record<string, string> = {
    // One click unsubscribe per RFC 8058. Required by Gmail/Yahoo Feb 2024
    // guidance for senders at scale; harmless at low volume.
    'List-Unsubscribe': `<mailto:${unsubscribeMailto}?subject=Unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    // Per send tracking id keeps Gmail from collapsing distinct
    // transactional messages into a single thread when subjects repeat.
    'X-Entity-Ref-ID': randomUUID(),
  }

  const { data, error } = await client.emails.send({
    from: formatFrom(fromName, fromAddress),
    to,
    subject,
    react,
    text,
    headers: { ...defaultHeaders, ...headers },
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
