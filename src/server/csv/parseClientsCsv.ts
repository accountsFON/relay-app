import { parse } from 'csv-parse/sync'

export type ParsedClientRow = {
  /** 1-indexed source row number (header is row 1; first data row is row 2). */
  rowIndex: number
  ok: boolean
  errors: string[]
  data?: ParsedClientData
}

export type ParsedClientData = {
  name: string
  businessSummary?: string
  brandVoice?: string
  industry?: string
  location?: string
  phone?: string
  mainCta?: string
  focus1?: string
  focus2?: string
  focus3?: string
  dos?: string
  donts?: string
  postingDays?: string
  postLength?: string
  urls?: string[]
  targetAudience?: string
  holidayHandling?: string
  excludedDates?: string[]
  assetsFolderUrl?: string
  autoCrawl?: string
  assignedAmId?: string
  assignedDesignerId?: string
}

/**
 * List parser tolerant of both the template's pipe delimiter and the newline
 * delimiter Airtable uses when exporting a multi-value cell:
 * `https://a|https://b` or `https://a\nhttps://b` → `['https://a','https://b']`
 */
function splitPipeList(raw: string): string[] {
  return raw.split(/[|\n\r]+/).map((s) => s.trim()).filter(Boolean)
}

const VALID_HOLIDAY_HANDLING = new Set(['Major-US', 'Off'])
const VALID_AUTOCRAWL = new Set(['always', 'when_empty', 'never'])

/** Header key normalizer: case- and punctuation-insensitive. */
function normalizeHeader(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Extra header aliases for the columns whose real-world (Airtable) display name
 * differs from the canonical camelCase field. Most Airtable headers already
 * match once normalized (e.g. "Business Summary" -> "businesssummary" ===
 * normalize("businessSummary")), so only the genuinely different names are
 * listed here. Values are normalized aliases -> canonical field.
 *
 * Intentionally NOT aliased: AMID / DESIGNERID. In an Airtable export those hold
 * Airtable's own record ids, not Relay user ids, so they must be ignored (the
 * import succeeds with no AM/designer) rather than mapped and rejected. The
 * canonical assignedAmId / assignedDesignerId still work for template users.
 */
const HEADER_ALIASES: Record<string, string> = {
  cityregion: 'location',
  city: 'location',
  region: 'location',
  businessphonenumber: 'phone',
  phonenumber: 'phone',
  cta: 'mainCta',
  do: 'dos',
  dont: 'donts',
  googledrivelinkassetsfolder: 'assetsFolderUrl',
  googledrivelink: 'assetsFolderUrl',
  assetsfolder: 'assetsFolderUrl',
}

const CANONICAL_FIELDS = [
  'name', 'businessSummary', 'brandVoice', 'industry', 'location', 'phone',
  'mainCta', 'focus1', 'focus2', 'focus3', 'dos', 'donts', 'postingDays',
  'postLength', 'urls', 'targetAudience', 'holidayHandling', 'excludedDates',
  'assetsFolderUrl', 'autoCrawl', 'assignedAmId', 'assignedDesignerId',
] as const

/** normalized header -> canonical field (canonical names + explicit aliases). */
const HEADER_TO_FIELD: Record<string, string> = {
  ...Object.fromEntries(CANONICAL_FIELDS.map((f) => [normalizeHeader(f), f])),
  ...HEADER_ALIASES,
}

/**
 * Remap a raw parsed row (keyed by the CSV's original headers) onto canonical
 * field names, so case, spacing, punctuation, and known display-name aliases
 * all resolve. Unknown columns are dropped; first matching header wins.
 */
function canonicalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [rawKey, value] of Object.entries(row)) {
    const field = HEADER_TO_FIELD[normalizeHeader(rawKey)]
    if (field && !(field in out)) out[field] = value ?? ''
  }
  return out
}

export function parseClientsCsv(text: string): ParsedClientRow[] {
  // Strip BOM if present
  const cleaned = text.replace(/^﻿/, '')

  let rows: Record<string, string>[]
  try {
    rows = parse(cleaned, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    })
  } catch (e) {
    return [
      {
        rowIndex: 0,
        ok: false,
        errors: [
          `CSV parse failed: ${e instanceof Error ? e.message : String(e)}`,
        ],
      },
    ]
  }

  return rows.map((rawRow, i) => {
    const row = canonicalizeRow(rawRow)
    const errors: string[] = []
    const rowIndex = i + 2 // header is row 1, first data row is row 2

    const name = (row.name ?? '').trim()
    if (!name) errors.push('missing required column: name')

    const holidayHandling = (row.holidayHandling ?? '').trim()
    if (holidayHandling && !VALID_HOLIDAY_HANDLING.has(holidayHandling)) {
      errors.push(
        `holidayHandling must be one of: Major-US, Off (got "${holidayHandling}")`,
      )
    }

    const autoCrawl = (row.autoCrawl ?? '').trim()
    if (autoCrawl && !VALID_AUTOCRAWL.has(autoCrawl)) {
      errors.push(
        `autoCrawl must be one of: always, when_empty, never (got "${autoCrawl}")`,
      )
    }

    if (errors.length > 0) {
      return { rowIndex, ok: false, errors }
    }

    return {
      rowIndex,
      ok: true,
      errors: [],
      data: {
        name,
        businessSummary: row.businessSummary?.trim() || undefined,
        brandVoice: row.brandVoice?.trim() || undefined,
        industry: row.industry?.trim() || undefined,
        location: row.location?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        mainCta: row.mainCta?.trim() || undefined,
        focus1: row.focus1?.trim() || undefined,
        focus2: row.focus2?.trim() || undefined,
        focus3: row.focus3?.trim() || undefined,
        dos: row.dos?.trim() || undefined,
        donts: row.donts?.trim() || undefined,
        postingDays: row.postingDays?.trim() || undefined,
        postLength: row.postLength?.trim() || undefined,
        urls: row.urls ? splitPipeList(row.urls) : undefined,
        targetAudience: row.targetAudience?.trim() || undefined,
        holidayHandling: holidayHandling || undefined,
        excludedDates: row.excludedDates
          ? splitPipeList(row.excludedDates)
          : undefined,
        assetsFolderUrl: row.assetsFolderUrl?.trim() || undefined,
        autoCrawl: autoCrawl || undefined,
        assignedAmId: row.assignedAmId?.trim() || undefined,
        assignedDesignerId: row.assignedDesignerId?.trim() || undefined,
      },
    }
  })
}

/** Header row + a sample row, suitable for download as a template CSV. */
export const CLIENT_CSV_TEMPLATE = `name,businessSummary,brandVoice,industry,location,phone,mainCta,focus1,focus2,focus3,dos,donts,postingDays,postLength,urls,targetAudience,holidayHandling,excludedDates,assetsFolderUrl,autoCrawl,assignedAmId,assignedDesignerId
Acme Marketing Example,Family-owned marketing firm,Friendly and professional,Marketing,Atlanta GA,(555) 555-1234,Get a quote,Lead generation,Brand awareness,Local SEO,Be specific,Avoid jargon,"Mon,Wed,Fri",90-120 words,https://acme.example|https://acme-blog.example,Local small businesses,Major-US,2026-12-25|2027-01-01,https://drive.google.com/example,always,,
`
