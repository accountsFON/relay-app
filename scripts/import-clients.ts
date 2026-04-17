/**
 * One-off CSV import for the Bekah AI databank.
 *
 * Usage:
 *   npx tsx scripts/import-clients.ts <csv-path> [--dry-run]
 *
 * Reads the CSV, filters to the clients in CLIENT_ALLOWLIST,
 * maps columns to Client model fields, and inserts to the DB
 * under the FON internal organization.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

function makePrisma() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const FON_ORG_CLERK_ID = 'fon-internal'

const CLIENT_ALLOWLIST = new Set([
  'Effect Med Spa',
  'Brothers Marine Construction',
  'Lift Disability',
  'North Florida Yacht Sales',
  'My DUI Guy',
  'Old Plank Christian Academy',
  'Puppy Avenue',
  'Sicilian Village',
  'Waylen Bay Marine',
  'Northeast Florida Heating and Air',
])

type CsvRow = Record<string, string>

function splitAndTrim(val: string | undefined, separator = /[,\n]/): string[] {
  if (!val) return []
  return val
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean)
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`
  if (trimmed.includes('.')) return `https://${trimmed}`
  return null
}

function mapStatus(copyJourney: string): 'active' | 'archived' | 'paused' {
  const v = copyJourney.trim().toLowerCase()
  if (v.startsWith('archive')) return 'archived'
  return 'active'
}

function mapHolidayHandling(raw: string): 'Major-US' | 'Off' {
  const v = raw.trim().toLowerCase()
  if (v === 'off' || v === 'none' || v === 'no') return 'Off'
  return 'Major-US'
}

function normalizeIsoDates(raw: string): string[] {
  return splitAndTrim(raw).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
}

function rowToClientInput(row: CsvRow, organizationId: string) {
  const urls = splitAndTrim(row['URLs'])
    .map(normalizeUrl)
    .filter((u): u is string => u !== null)

  const assetsFolderRaw = row['Google Drive Link (Assets Folder)']?.trim() ?? ''
  const assetsFolderUrl =
    assetsFolderRaw && /^https?:\/\//i.test(assetsFolderRaw)
      ? assetsFolderRaw
      : undefined

  const postingDaysRaw = row['Posting Days']?.trim()
  const postingDays = postingDaysRaw && postingDaysRaw.length > 0
    ? postingDaysRaw
    : 'Mon,Wed,Fri'

  return {
    organizationId,
    name: row['Name']?.trim() ?? '',
    businessSummary: row['Business Summary']?.trim() || null,
    brandVoice: row['Brand Voice']?.trim() || null,
    industry: row['Industry']?.trim() || null,
    location: row['City/Region']?.trim() || null,
    phone: row['Business Phone Number']?.trim() || null,
    mainCta: row['Main CTA']?.trim() || null,
    focus1: row['Focus 1']?.trim() || null,
    focus2: row['Focus 2']?.trim() || null,
    focus3: row['Focus 3']?.trim() || null,
    dos: row['Do']?.trim() || null,
    donts: row["Don't"]?.trim() || null,
    postingDays,
    postLength: row['Post Length']?.trim() || null,
    urls,
    targetAudience: row['Target Audience']?.trim() || null,
    holidayHandling: mapHolidayHandling(row['Holiday Handling'] ?? ''),
    excludedDates: normalizeIsoDates(row['Excluded Dates'] ?? ''),
    assetsFolderUrl,
    status: mapStatus(row['Copy Journey'] ?? ''),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find((a) => !a.startsWith('--'))
  const dryRun = args.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-clients.ts <csv-path> [--dry-run]')
    process.exit(1)
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(csvPath, 'utf-8')
  // Strip BOM if present
  const cleaned = raw.replace(/^\uFEFF/, '')

  const rows: CsvRow[] = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  })

  const matched = rows.filter((r) => CLIENT_ALLOWLIST.has(r['Name']?.trim() ?? ''))

  console.log(`CSV rows: ${rows.length}`)
  console.log(`Matched clients from allowlist: ${matched.length}/${CLIENT_ALLOWLIST.size}`)

  const missing = [...CLIENT_ALLOWLIST].filter(
    (name) => !matched.some((r) => r['Name']?.trim() === name)
  )
  if (missing.length > 0) {
    console.warn(`Missing from CSV: ${missing.join(', ')}`)
  }

  const prisma = makePrisma()

  try {
    const org = await prisma.organization.findUnique({
      where: { clerkOrgId: FON_ORG_CLERK_ID },
    })

    if (!org) {
      console.error(`Organization not found: clerkOrgId=${FON_ORG_CLERK_ID}`)
      console.error('Complete onboarding in the app first to create the FON org.')
      process.exit(1)
    }

    console.log(`Target org: ${org.name} (${org.id})`)
    console.log('')

    for (const row of matched) {
      const input = rowToClientInput(row, org.id)

      console.log(`- ${input.name}`)
      console.log(`    industry: ${input.industry ?? '(none)'}`)
      console.log(`    location: ${input.location ?? '(none)'}`)
      console.log(`    urls: ${input.urls.join(', ') || '(none)'}`)
      console.log(`    status: ${input.status}`)

      if (dryRun) continue

      const existing = await prisma.client.findFirst({
        where: { organizationId: org.id, name: input.name },
      })

      if (existing) {
        console.log(`    SKIP — already exists (${existing.id})`)
        continue
      }

      const created = await prisma.client.create({ data: input })
      console.log(`    CREATED ${created.id}`)
    }

    console.log('')
    console.log(dryRun ? '(dry run — no changes written)' : 'Done.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
