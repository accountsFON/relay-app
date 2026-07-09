/**
 * Parse a free-text recipient string (from the Send review link modal) into a
 * clean list of email addresses. Supports multiple recipients separated by
 * commas, semicolons, or newlines — so an AM can paste "a@x.com, b@x.com".
 *
 * Valid addresses are trimmed, deduped case-insensitively (first occurrence +
 * order preserved), and returned in `emails`. Non-empty tokens that fail the
 * shape check land in `invalid` so the caller can name them in an error.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface ParsedRecipientEmails {
  emails: string[]
  invalid: string[]
}

export function parseRecipientEmails(raw: string): ParsedRecipientEmails {
  const tokens = raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  const emails: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  for (const token of tokens) {
    if (!EMAIL_RE.test(token)) {
      invalid.push(token)
      continue
    }
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    emails.push(token)
  }

  return { emails, invalid }
}
