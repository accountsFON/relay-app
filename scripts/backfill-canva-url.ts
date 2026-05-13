/**
 * One-off backfill: set `client.canvaUrl` to the agency-wide Canva folder
 * for clients that don't yet have a per-client URL.
 *
 * Idempotent: only touches rows where `canvaUrl IS NULL OR canvaUrl = ''`.
 *
 * Dry-run by default. Pass `--apply` to commit the write.
 * Org-scoped: pass `--org-id <id>` to scope to a single Organization
 * (recommended — the FON agency folder is FON's, not every tenant's).
 * Without `--org-id`, the dry-run lists per-org counts so you can pick.
 *
 * Recovery: to undo, run:
 *   UPDATE clients SET "canvaUrl" = NULL
 *   WHERE "canvaUrl" = 'https://www.canva.com/folder/FAFx8YbetmY';
 *
 * Usage:
 *   tsx scripts/backfill-canva-url.ts                  # dry-run, all orgs
 *   tsx scripts/backfill-canva-url.ts --org-id <id>    # dry-run, one org
 *   tsx scripts/backfill-canva-url.ts --org-id <id> --apply
 */
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import { FALLBACK_CANVA_FOLDER_URL } from '../src/lib/canva'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const orgIdx = args.indexOf('--org-id')
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : undefined

  console.log(
    `Backfill Canva URL  -  ${apply ? 'APPLY' : 'DRY RUN'}${orgId ? ` (org ${orgId})` : ' (all orgs)'}`,
  )
  console.log(`Target URL: ${FALLBACK_CANVA_FOLDER_URL}`)

  const dbUrl = process.env.DATABASE_URL ?? '(not set)'
  console.log(`DB: ${dbUrl.replace(/:[^@]+@/, ':***@')}`)
  console.log('')

  const where = {
    AND: [
      { OR: [{ canvaUrl: null }, { canvaUrl: '' }] },
      orgId ? { organizationId: orgId } : {},
    ],
  }

  const candidates = await db.client.findMany({
    where,
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
    orderBy: [{ organizationId: 'asc' }, { name: 'asc' }],
  })

  if (candidates.length === 0) {
    console.log('No clients to backfill. Nothing to do.')
    process.exit(0)
  }

  const byOrg = new Map<string, { name: string; clients: string[] }>()
  for (const c of candidates) {
    const key = c.organizationId
    if (!byOrg.has(key)) {
      byOrg.set(key, { name: c.organization.name, clients: [] })
    }
    byOrg.get(key)!.clients.push(c.name)
  }

  console.log(
    `Found ${candidates.length} clients with empty canvaUrl across ${byOrg.size} org(s):`,
  )
  console.log('')
  for (const [orgIdKey, info] of byOrg) {
    console.log(`  ${info.name} (${orgIdKey})  -  ${info.clients.length} clients`)
    for (const name of info.clients.slice(0, 8)) console.log(`    - ${name}`)
    if (info.clients.length > 8) console.log(`    ... and ${info.clients.length - 8} more`)
  }
  console.log('')

  if (!apply) {
    if (!orgId) {
      console.log(
        'DRY RUN. Re-run with --org-id <id> to scope, then --apply to write.',
      )
    } else {
      console.log(`DRY RUN. Re-run with --apply to write ${candidates.length} rows.`)
    }
    process.exit(0)
  }

  if (!orgId) {
    console.error('Refusing to apply across all orgs. Pass --org-id <id> to scope.')
    process.exit(1)
  }

  const result = await db.client.updateMany({
    where,
    data: { canvaUrl: FALLBACK_CANVA_FOLDER_URL },
  })
  console.log(`Updated ${result.count} clients.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
