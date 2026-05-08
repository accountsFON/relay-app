'use server'

import { revalidatePath } from 'next/cache'
import { requireCan } from '@/server/middleware/permissions'
import { db } from '@/db/client'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import {
  parseClientsCsv,
  type ParsedClientRow,
} from '@/server/csv/parseClientsCsv'

export type ImportResult = {
  ok: boolean
  rows: ParsedClientRow[]
  error?: string
  createdCount?: number
}

/**
 * Parses + validates a CSV, then transactionally creates all rows on success.
 *
 * mode='single' enforces exactly 1 data row.
 * mode='bulk' allows N. Either way, the create is all-or-nothing: any
 * row-level failure aborts the entire import without touching the DB.
 */
export async function importClientsCsv(input: {
  csvText: string
  mode: 'single' | 'bulk'
}): Promise<ImportResult> {
  const ctx = await requireCan('client.create')

  const rows = parseClientsCsv(input.csvText)

  if (rows.length === 0) {
    return { ok: false, rows, error: 'CSV has no data rows.' }
  }

  if (input.mode === 'single' && rows.length !== 1) {
    return {
      ok: false,
      rows,
      error: `Single mode requires exactly 1 data row (CSV has ${rows.length}).`,
    }
  }

  // Validate any user references against the active org's Memberships.
  const memberships = await listMembershipsForOrg(ctx.organizationDbId)
  const ams = new Set(
    memberships.filter((m) => m.role === 'account_manager').map((m) => m.user.id),
  )
  const designers = new Set(
    memberships.filter((m) => m.role === 'designer').map((m) => m.user.id),
  )

  for (const row of rows) {
    if (!row.ok || !row.data) continue
    if (row.data.assignedAmId && !ams.has(row.data.assignedAmId)) {
      row.ok = false
      row.errors.push(
        `assignedAmId "${row.data.assignedAmId}" is not an account_manager in this agency`,
      )
    }
    if (row.data.assignedDesignerId && !designers.has(row.data.assignedDesignerId)) {
      row.ok = false
      row.errors.push(
        `assignedDesignerId "${row.data.assignedDesignerId}" is not a designer in this agency`,
      )
    }
  }

  const failed = rows.filter((r) => !r.ok)
  if (failed.length > 0) {
    return {
      ok: false,
      rows,
      error: `${failed.length} of ${rows.length} rows failed validation. Fix the errors and retry.`,
    }
  }

  const orgId = ctx.organizationDbId

  await db.$transaction(
    rows
      .filter((r) => r.ok && r.data)
      .map((r) =>
        db.client.create({
          data: {
            organizationId: orgId,
            name: r.data!.name,
            businessSummary: r.data!.businessSummary ?? null,
            brandVoice: r.data!.brandVoice ?? null,
            industry: r.data!.industry ?? null,
            location: r.data!.location ?? null,
            phone: r.data!.phone ?? null,
            mainCta: r.data!.mainCta ?? null,
            focus1: r.data!.focus1 ?? null,
            focus2: r.data!.focus2 ?? null,
            focus3: r.data!.focus3 ?? null,
            dos: r.data!.dos ?? null,
            donts: r.data!.donts ?? null,
            postingDays: r.data!.postingDays ?? 'Mon,Wed,Fri',
            postLength: r.data!.postLength ?? null,
            urls: r.data!.urls ?? [],
            targetAudience: r.data!.targetAudience ?? null,
            holidayHandling: r.data!.holidayHandling ?? 'Major-US',
            excludedDates: r.data!.excludedDates ?? [],
            assetsFolderUrl: r.data!.assetsFolderUrl ?? null,
            autoCrawl: r.data!.autoCrawl ?? 'always',
            assignedAmId: r.data!.assignedAmId ?? null,
            assignedDesignerId: r.data!.assignedDesignerId ?? null,
            status: 'active',
          },
        }),
      ),
  )

  revalidatePath('/clients')

  return {
    ok: true,
    rows,
    createdCount: rows.length,
  }
}
