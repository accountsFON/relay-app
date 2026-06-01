/**
 * Mention parsing helpers: pure functions, safe to import client + server.
 *
 * Spec: projects/relay-app/2026-05-09-activity-thread-plan.md § Mention parsing
 *
 * Handle format: `firstname.lastname` (lowercased, ASCII letters/digits only).
 * The composer renders this format in the dropdown; the server parses it
 * back to userIds via the org membership roster.
 */

/**
 * Matches `@handle` only when the @ is at the start of the string or preceded
 * by a non-word character. Avoids treating email addresses like `tom@gmail.com`
 * as mentions.
 */
const HANDLE_RE = /(?<=^|[^a-z0-9])@([a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])/gi

/**
 * Convert a User.name to its mention handle.
 *
 * "Julio Aleman"   -> "julio.aleman"
 * "Mollie Huebner" -> "mollie.huebner"
 * "Caleb"          -> "caleb"
 * "X Æ A-12"       -> "x.a12"   (strips non-ASCII; "-" stays normalized)
 */
export function handleFromName(name: string): string {
  const parts = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
  if (parts.length === 0) return ''
  return parts.join('.')
}

/** Extract `@handle` tokens from a body string. Dedupes. */
export function parseHandles(body: string): string[] {
  const matches = body.matchAll(HANDLE_RE)
  const seen = new Set<string>()
  for (const m of matches) {
    const h = m[1]?.toLowerCase()
    if (h) seen.add(h)
  }
  return Array.from(seen)
}

export interface MentionTarget {
  id: string
  name: string
  handle: string
}

/**
 * Resolve `@handles` in a body to user IDs against a roster.
 * Unknown handles are silently dropped (V1 doesn't error on typos).
 */
export function resolveMentionedUserIds(
  body: string,
  roster: MentionTarget[]
): string[] {
  const handles = parseHandles(body)
  if (handles.length === 0) return []
  const byHandle = new Map(roster.map((m) => [m.handle, m.id]))
  const ids: string[] = []
  for (const h of handles) {
    const id = byHandle.get(h)
    if (id) ids.push(id)
  }
  return Array.from(new Set(ids))
}

/**
 * Build a roster of MentionTargets from a memberships listing.
 * Pages call this and pass the result down to CommentComposer.
 */
export function buildMentionRoster<
  T extends { user: { id: string; name: string } },
>(memberships: T[]): MentionTarget[] {
  return memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    handle: handleFromName(m.user.name),
  }))
}

/**
 * Tokenize a body into runs of text and runs of `@handle` tokens.
 * Used by the renderer to style mention chips.
 */
export type BodyToken =
  | { type: 'text'; value: string }
  | { type: 'mention'; handle: string; raw: string }

export function tokenizeBody(body: string): BodyToken[] {
  const tokens: BodyToken[] = []
  let cursor = 0
  for (const m of body.matchAll(HANDLE_RE)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (start > cursor) tokens.push({ type: 'text', value: body.slice(cursor, start) })
    tokens.push({ type: 'mention', handle: (m[1] ?? '').toLowerCase(), raw: m[0] })
    cursor = end
  }
  if (cursor < body.length) tokens.push({ type: 'text', value: body.slice(cursor) })
  return tokens
}

/**
 * Compatibility shim for the older `mention-parser.ts` API.
 * extractHandles + userNameToHandle were the names used by the
 * Phase-2-out-of-scope server action commit. Kept as aliases so any
 * lingering imports keep working without a separate file.
 */
export const extractHandles = parseHandles
export const userNameToHandle = handleFromName
