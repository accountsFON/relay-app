/**
 * Validation/normalization for the minimal white-label agency branding (P2 #21):
 * an accent color and a logo URL on the Organization. Shared by the settings
 * action (validate on save) and any defensive read before rendering the
 * agency-supplied values into the client email / review page.
 */

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Return a trimmed `#rgb`/`#rrggbb` hex color, or null if not a valid hex. */
export function normalizeBrandColor(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  return HEX_COLOR_RE.test(v) ? v : null
}

/**
 * Return a trimmed http(s) URL, or null. Rejects `javascript:` / `data:` and
 * anything that isn't a parseable http(s) URL — the value is rendered into the
 * client email + review page, so keep the scheme allowlist tight even though
 * the value is agency-self-set (admin-gated), not attacker-supplied.
 */
export function normalizeBrandLogoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  try {
    const url = new URL(v)
    if (url.protocol === 'http:' || url.protocol === 'https:') return v
    return null
  } catch {
    return null
  }
}
