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
  const client = escapeHtml(input.clientName)
  const month = escapeHtml(input.monthLabel)
  const url = escapeHtml(input.reviewUrl)

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Review ${client} ${month}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;line-height:1.5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f3;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">

          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #efefee;">
              <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#888;">Five One Nine Marketing</div>
              <div style="font-size:13px;color:#999;margin-top:4px;">Review request</div>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 32px 8px;">
              <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${client}</h1>
              <div style="font-size:15px;color:#666;">${month} posts ready for your review</div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 8px;">
              <p style="margin:0 0 14px;font-size:16px;">Hi ${fname},</p>
              <p style="margin:0 0 14px;font-size:16px;">The ${month} posts are ready. Open the link below to see each post rendered as it will appear on Instagram and Facebook, leave any feedback right on the post, and we will take it from there.</p>
              <p style="margin:0 0 14px;font-size:16px;color:#666;">No login or account needed. The link is yours.</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 32px 28px;">
              <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:16px;">Review the batch</a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 24px;">
              <div style="font-size:12px;color:#999;border-top:1px solid #efefee;padding-top:16px;word-break:break-all;">
                Button not working? Paste this URL into your browser:<br>
                <a href="${url}" style="color:#666;">${url}</a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #efefee;font-size:13px;color:#888;">
              Link expires ${expires}. Questions? Just reply to this email.
              <div style="margin-top:14px;color:#666;">
                ${sender}<br>
                Five One Nine Marketing
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body></html>
`.trim()
}

export function buildText(input: SendMagicLinkEmailInput): string {
  const fname = firstName(input.recipientName)
  return [
    `Hi ${fname},`,
    '',
    `${input.clientName} - ${input.monthLabel} posts are ready for your review.`,
    '',
    'Open the link below to see each post rendered as it will appear on Instagram and Facebook, leave any feedback right on the post, and we will take it from there. No login or account needed.',
    '',
    'Review the batch:',
    input.reviewUrl,
    '',
    `Link expires ${formatExpiry(input.expiresAt)}. Questions? Just reply to this email.`,
    '',
    input.senderName,
    'Five One Nine Marketing',
  ].join('\n')
}

export async function sendMagicLinkEmail(
  input: SendMagicLinkEmailInput,
): Promise<SendMagicLinkEmailResult> {
  const { url, secret } = getEnv()

  // fon-email worker expects htmlBody + body field names (not html + text).
  // Source: /Users/caleb/dev/fon-email-service/worker.js line 178:
  // const { to, subject, body: textBody, htmlBody, cc, bcc, replyToMessageId } = body;
  // Mismatched field names land Gmail messages with empty bodies.
  const body = {
    to: input.recipientEmail,
    subject: buildSubject(input.clientName, input.monthLabel),
    htmlBody: buildHtml(input),
    body: buildText(input),
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
