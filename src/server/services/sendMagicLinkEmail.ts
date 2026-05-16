/**
 * sendMagicLinkEmail — wraps the fon-email Cloudflare Worker.
 *
 * The Worker is the standard Five One Nine email egress (Gmail API via
 * service account + domain-wide delegation). We POST JSON with an
 * Authorization secret header; the worker returns 200 + { messageId } on
 * success.
 *
 * No retries here: the calling action surfaces failure to the AM (UI
 * shows "link created but email failed" and the AM can copy the URL
 * manually). Adding retries before that escape hatch exists would mask
 * misconfiguration during the rollout window.
 *
 * Env:
 *   FON_EMAIL_WORKER_URL    — full https URL of the worker endpoint
 *   FON_EMAIL_WORKER_SECRET — bearer secret expected in Authorization
 *
 * Both must be present at call time. The lib throws if unset rather
 * than silently no-op'ing — silent failure is worse than a loud AM
 * error in the modal.
 */

export interface SendMagicLinkEmailInput {
  recipientName: string
  recipientEmail: string
  /** AM's name; used in the greeting and From-line display. */
  senderName: string
  clientName: string
  /** YYYY-MM display string, e.g. "May 2026". */
  monthLabel: string
  /** Fully-qualified review URL the AM just generated. */
  reviewUrl: string
  expiresAt: Date
}

export interface SendMagicLinkEmailResult {
  messageId: string | null
}

function getEnv(): { url: string; secret: string } {
  const url = process.env.FON_EMAIL_WORKER_URL
  const secret = process.env.FON_EMAIL_WORKER_SECRET
  if (!url || !secret) {
    throw new Error(
      'sendMagicLinkEmail: FON_EMAIL_WORKER_URL and FON_EMAIL_WORKER_SECRET must be set',
    )
  }
  return { url, secret }
}

function firstName(full: string): string {
  const trimmed = full.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

function formatExpiry(d: Date): string {
  // Avoid Intl variance across runtimes — render as "May 31, 2026".
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildSubject(clientName: string, monthLabel: string): string {
  return `[Five One Nine] ${clientName} ${monthLabel} batch ready for your review`
}

export function buildHtml(input: SendMagicLinkEmailInput): string {
  const fname = escapeHtml(firstName(input.recipientName))
  const expires = escapeHtml(formatExpiry(input.expiresAt))
  const sender = escapeHtml(input.senderName)
  const month = escapeHtml(input.monthLabel)
  const url = escapeHtml(input.reviewUrl)

  return `
<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hi ${fname},</p>
  <p>The ${month} posts are ready. Take a look and leave any feedback directly on each post. No login needed.</p>
  <p style="margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:500;">Review the batch</a>
  </p>
  <p style="color:#666;font-size:13px;">Link expires ${expires}. If you have any trouble, reply to this email.</p>
  <p style="color:#666;font-size:13px;">${sender}<br/>Five One Nine Marketing</p>
</body></html>
`.trim()
}

export function buildText(input: SendMagicLinkEmailInput): string {
  const fname = firstName(input.recipientName)
  return [
    `Hi ${fname},`,
    '',
    `The ${input.monthLabel} posts are ready. Take a look and leave any feedback directly on each post. No login needed.`,
    '',
    input.reviewUrl,
    '',
    `Link expires ${formatExpiry(input.expiresAt)}. If you have any trouble, reply to this email.`,
    '',
    `${input.senderName}`,
    `Five One Nine Marketing`,
  ].join('\n')
}

export async function sendMagicLinkEmail(
  input: SendMagicLinkEmailInput,
): Promise<SendMagicLinkEmailResult> {
  const { url, secret } = getEnv()

  const body = {
    to: input.recipientEmail,
    subject: buildSubject(input.clientName, input.monthLabel),
    html: buildHtml(input),
    text: buildText(input),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
      // Worker requires X-Mailbox to know which @fonmarketing.com Gmail
      // mailbox to send FROM. accounts@ is the canonical FON accounts
      // mailbox (matches the "all client platform access goes to accounts@"
      // convention). Hardcoded for v1; could become per-AM later.
      'x-mailbox': 'accounts@fonmarketing.com',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `sendMagicLinkEmail: worker returned ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 240)}` : ''}`,
    )
  }

  // The worker historically returns { messageId } but we tolerate either
  // shape; callers only use messageId for logging.
  let messageId: string | null = null
  try {
    const json = (await res.json()) as { messageId?: string }
    messageId = json?.messageId ?? null
  } catch {
    // Worker may return an empty 200 — treat as success.
  }

  return { messageId }
}
