'use server'

import { revalidatePath } from 'next/cache'
import { requireCan } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import {
  parseClientsCsv,
  parseClientsCsvWithMapping,
  readCsvHeaders,
  suggestFieldMapping,
  type ParsedClientRow,
  type ParsedClientData,
  type FieldMapping,
  type ClientField,
} from '@/server/csv/parseClientsCsv'
import {
  buildImportPlan,
  type ImportPlan,
  type ExistingClientMatchRow,
} from '@/server/csv/matchClients'

export type ImportAnalysis = {
  ok: boolean
  headers: string[]
  suggested: Record<ClientField, string | null>
  rowCount: number
  error?: string
}

export type ImportPreview = {
  ok: boolean
  plan?: ImportPlan
  error?: string
}

export type ImportResult = {
  ok: boolean
  plan?: ImportPlan
  createdCount?: number
  updatedCount?: number
  error?: string
}

type ImportInput = {
  csvText: string
  mode: 'single' | 'bulk'
  /** Explicit field->column mapping from the import UI. Falls back to
   *  automatic header detection when omitted. */
  mapping?: FieldMapping
}

/**
 * Read a CSV's header row + row count and auto-suggest a field->column mapping,
 * so the import UI can show a column-mapping step the user can review/correct.
 */
export async function analyzeClientsCsv(csvText: string): Promise<ImportAnalysis> {
  await requireCan('client.create')
  try {
    const headers = readCsvHeaders(csvText)
    const suggested = suggestFieldMapping(headers)
    if (headers.length === 0) {
      return { ok: false, headers, suggested, rowCount: 0, error: 'Could not read a header row from this CSV.' }
    }
    const rowCount = parseClientsCsv(csvText).filter((r) => r.rowIndex > 0).length
    return { ok: true, headers, suggested, rowCount }
  } catch (e) {
    return {
      ok: false,
      headers: [],
      suggested: suggestFieldMapping([]),
      rowCount: 0,
      error: e instanceof Error ? e.message : 'Failed to read CSV',
    }
  }
}

/** Parse + validate rows (empty check, single-mode, member references). */
async function parseAndValidate(
  input: ImportInput,
): Promise<{ rows: ParsedClientRow[]; orgId: string; error?: string }> {
  const ctx = await requireCan('client.create')
  const orgId = ctx.organizationDbId

  const rows = input.mapping
    ? parseClientsCsvWithMapping(input.csvText, input.mapping)
    : parseClientsCsv(input.csvText)

  if (rows.length === 0) return { rows, orgId, error: 'CSV has no data rows.' }
  if (input.mode === 'single' && rows.length !== 1) {
    return { rows, orgId, error: `Single mode requires exactly 1 data row (CSV has ${rows.length}).` }
  }

  // Validate user references against the active org's Memberships.
  const memberships = await listMembershipsForOrg(orgId)
  const ams = new Set(memberships.filter((m) => m.role === 'account_manager').map((m) => m.user.id))
  const designers = new Set(memberships.filter((m) => m.role === 'designer').map((m) => m.user.id))
  for (const row of rows) {
    if (!row.ok || !row.data) continue
    if (row.data.assignedAmId && !ams.has(row.data.assignedAmId)) {
      row.ok = false
      row.errors.push(`assignedAmId "${row.data.assignedAmId}" is not an account_manager in this agency`)
    }
    if (row.data.assignedDesignerId && !designers.has(row.data.assignedDesignerId)) {
      row.ok = false
      row.errors.push(`assignedDesignerId "${row.data.assignedDesignerId}" is not a designer in this agency`)
    }
  }

  return { rows, orgId }
}

/** Live (non-archived) clients in the org, for phone/URL duplicate matching. */
async function loadExistingMatchRows(orgId: string): Promise<ExistingClientMatchRow[]> {
  return db.client.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, phone: true, urls: true },
  })
}

/**
 * Dry run: parse + validate, then match each row against existing clients
 * (phone or any URL host) and return the create/update plan — no writes.
 */
export async function previewImportClientsCsv(input: ImportInput): Promise<ImportPreview> {
  const { rows, orgId, error } = await parseAndValidate(input)
  if (error) return { ok: false, error }
  const existing = await loadExistingMatchRows(orgId)
  const plan = buildImportPlan(rows, existing)
  return { ok: plan.ok, plan }
}

function createData(orgId: string, d: ParsedClientData) {
  return {
    organizationId: orgId,
    name: d.name,
    businessSummary: d.businessSummary ?? null,
    brandVoice: d.brandVoice ?? null,
    industry: d.industry ?? null,
    location: d.location ?? null,
    phone: d.phone ?? null,
    mainCta: d.mainCta ?? null,
    focus1: d.focus1 ?? null,
    focus2: d.focus2 ?? null,
    focus3: d.focus3 ?? null,
    dos: d.dos ?? null,
    donts: d.donts ?? null,
    postingDays: d.postingDays ?? 'Mon,Wed,Fri',
    postLength: d.postLength ?? null,
    urls: d.urls ?? [],
    targetAudience: d.targetAudience ?? null,
    holidayHandling: d.holidayHandling ?? 'Major-US',
    excludedDates: d.excludedDates ?? [],
    assetsFolderUrl: d.assetsFolderUrl ?? null,
    autoCrawl: d.autoCrawl ?? 'always',
    assignedAmId: d.assignedAmId ?? null,
    assignedDesignerId: d.assignedDesignerId ?? null,
    status: 'active' as const,
  }
}

/** Fill-only-provided update: set a field only when the CSV supplied a value,
 *  so blank cells never wipe existing client data. */
function updateData(d: ParsedClientData) {
  const data: Record<string, unknown> = {}
  const set = (key: keyof ParsedClientData) => {
    const v = d[key]
    if (v !== undefined) data[key] = v
  }
  ;([
    'name', 'businessSummary', 'brandVoice', 'industry', 'location', 'phone',
    'mainCta', 'focus1', 'focus2', 'focus3', 'dos', 'donts', 'postingDays',
    'postLength', 'urls', 'targetAudience', 'holidayHandling', 'excludedDates',
    'assetsFolderUrl', 'autoCrawl', 'assignedAmId', 'assignedDesignerId',
  ] as (keyof ParsedClientData)[]).forEach(set)
  return data
}

/**
 * Import a CSV as an upsert: rows matching an existing client (by phone or any
 * URL host) update it (fill-only-provided); unmatched rows create new clients.
 * All-or-nothing: any error row aborts without touching the DB. Recomputes the
 * plan server-side (does not trust a client-sent plan).
 */
export async function importClientsCsv(input: ImportInput): Promise<ImportResult> {
  const { rows, orgId, error } = await parseAndValidate(input)
  if (error) return { ok: false, error }

  const existing = await loadExistingMatchRows(orgId)
  const plan = buildImportPlan(rows, existing)
  if (!plan.ok) {
    return {
      ok: false,
      plan,
      error: `${plan.errorCount} of ${plan.rows.length} rows can't be imported. Fix the errors and retry.`,
    }
  }

  const planByIndex = new Map(plan.rows.map((p) => [p.rowIndex, p]))
  const ops = rows
    .filter((r) => r.ok && r.data)
    .map((r) => {
      const p = planByIndex.get(r.rowIndex)!
      return p.action === 'update'
        ? db.client.update({ where: { id: p.matchedClientId! }, data: updateData(r.data!) })
        : db.client.create({ data: createData(orgId, r.data!) })
    })

  await db.$transaction(ops)
  revalidatePath('/clients')

  return { ok: true, plan, createdCount: plan.newCount, updatedCount: plan.updateCount }
}
