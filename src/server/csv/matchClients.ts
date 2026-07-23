import type { ParsedClientRow, ParsedClientData } from './parseClientsCsv'

/** The existing-client shape needed to match against (phone + urls). */
export type ExistingClientMatchRow = {
  id: string
  name: string
  phone: string | null
  urls: string[]
}

export type ImportAction = 'create' | 'update'

export type ImportPlanRow = {
  rowIndex: number
  ok: boolean
  errors: string[]
  action: ImportAction
  name: string
  /** Set when action === 'update'. */
  matchedClientId?: string
  matchedClientName?: string
}

export type ImportPlan = {
  ok: boolean
  rows: ImportPlanRow[]
  newCount: number
  updateCount: number
  errorCount: number
}

/** Digits-only phone key; drops a leading US country-code 1 so 11- and
 *  10-digit forms of the same number match. Returns null for empty/too-short. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return trimmed.length >= 7 ? trimmed : null
}

/** Host key for a URL: lowercased, protocol/www/path/trailing-dot stripped.
 *  `https://www.Acme.com/about` and `acme.com/` both → `acme.com`. */
export function normalizeUrlHost(url: string | null | undefined): string | null {
  if (!url) return null
  let s = url.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '')
  s = s.split(/[/?#]/)[0].replace(/\.$/, '')
  return s || null
}

function hostSet(urls: string[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const u of urls ?? []) {
    const h = normalizeUrlHost(u)
    if (h) out.add(h)
  }
  return out
}

/**
 * Return the ids of existing clients a row matches on phone OR any URL host.
 * (Phone digits-equal, or a shared normalized URL host.)
 */
export function findMatchingClientIds(
  data: Pick<ParsedClientData, 'phone' | 'urls'>,
  existing: ExistingClientMatchRow[],
): string[] {
  const phone = normalizePhone(data.phone)
  const hosts = hostSet(data.urls)
  const matched = new Set<string>()
  for (const c of existing) {
    const cPhone = normalizePhone(c.phone)
    if (phone && cPhone && phone === cPhone) {
      matched.add(c.id)
      continue
    }
    const cHosts = hostSet(c.urls)
    for (const h of cHosts) {
      if (hosts.has(h)) {
        matched.add(c.id)
        break
      }
    }
  }
  return [...matched]
}

/**
 * Build the create/update plan for parsed rows against existing clients.
 * - A row matching exactly one existing client → update it.
 * - A row matching none → create.
 * - A row matching multiple existing clients → error (ambiguous; resolve by hand).
 * - Two+ rows matching the SAME existing client → all error (ambiguous target).
 * Rows that already failed parse/validation stay errors.
 */
export function buildImportPlan(
  rows: ParsedClientRow[],
  existing: ExistingClientMatchRow[],
): ImportPlan {
  const byId = new Map(existing.map((c) => [c.id, c]))

  const prelim: ImportPlanRow[] = rows.map((r) => {
    const name = r.data?.name ?? ''
    if (!r.ok || !r.data) {
      return { rowIndex: r.rowIndex, ok: false, errors: r.errors, action: 'create', name }
    }
    const matches = findMatchingClientIds(r.data, existing)
    if (matches.length > 1) {
      const names = matches.map((id) => byId.get(id)?.name ?? id)
      return {
        rowIndex: r.rowIndex,
        ok: false,
        errors: [`matches multiple existing clients: ${names.join(', ')}`],
        action: 'create',
        name,
      }
    }
    if (matches.length === 1) {
      const c = byId.get(matches[0])!
      return {
        rowIndex: r.rowIndex,
        ok: true,
        errors: [],
        action: 'update',
        name,
        matchedClientId: c.id,
        matchedClientName: c.name,
      }
    }
    return { rowIndex: r.rowIndex, ok: true, errors: [], action: 'create', name }
  })

  // Guard: two rows updating the same existing client is ambiguous.
  const targetCount = new Map<string, number>()
  for (const p of prelim) {
    if (p.action === 'update' && p.matchedClientId) {
      targetCount.set(p.matchedClientId, (targetCount.get(p.matchedClientId) ?? 0) + 1)
    }
  }
  const finalRows = prelim.map((p) => {
    if (p.action === 'update' && p.matchedClientId && (targetCount.get(p.matchedClientId) ?? 0) > 1) {
      return {
        ...p,
        ok: false,
        errors: [...p.errors, `multiple CSV rows match the same existing client (${p.matchedClientName})`],
      }
    }
    return p
  })

  const newCount = finalRows.filter((p) => p.ok && p.action === 'create').length
  const updateCount = finalRows.filter((p) => p.ok && p.action === 'update').length
  const errorCount = finalRows.filter((p) => !p.ok).length

  return { ok: errorCount === 0, rows: finalRows, newCount, updateCount, errorCount }
}
