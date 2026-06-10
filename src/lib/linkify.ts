/**
 * URL auto-linking primitive: pure, safe to import client + server.
 *
 * App-wide rule: any URL a user types into free text (thread comments today,
 * and other surfaces as they adopt this) should render as a clickable link
 * that opens in a new tab. This splits a run of text into plain-text and link
 * tokens; the renderer turns link tokens into `<a target="_blank" rel="...">`.
 */

export type LinkToken =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; value: string }

/**
 * Matches an http(s):// URL or a bare www. URL, greedily to the next
 * whitespace. Trailing sentence punctuation is trimmed separately so
 * "see https://x.com." does not capture the period.
 */
const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi

/** Punctuation that commonly trails a URL in prose but is not part of it. */
const TRAILING_PUNCT_RE = /[.,!?;:)\]}'"]+$/

/** Turn a matched URL into an href; bare www. URLs get an https:// scheme. */
export function normalizeHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
}

/**
 * Split a string into text and link tokens. Empty input (and empty gaps)
 * produce no tokens, so callers can map straight to nodes.
 */
export function splitOnUrls(text: string): LinkToken[] {
  const tokens: LinkToken[] = []
  let cursor = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const matched = m[0]
    // Trim trailing prose punctuation; it falls back into the next text run.
    const value = matched.replace(TRAILING_PUNCT_RE, '')
    if (!value) continue
    if (start > cursor) tokens.push({ type: 'text', value: text.slice(cursor, start) })
    tokens.push({ type: 'link', href: normalizeHref(value), value })
    cursor = start + value.length
  }
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) })
  return tokens
}
