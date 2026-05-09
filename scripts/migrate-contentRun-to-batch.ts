/**
 * One-shot migration: ContentRun → Batch.
 *
 * For every existing ContentRun, create a corresponding Batch and
 * backfill Post.batchId. Idempotent: skips ContentRuns that already
 * have a matching Batch (matched by clientId + label).
 *
 * The mapping:
 *   - Batch.label        = ContentRun.targetMonth (e.g. "2026-05")
 *   - Batch.currentStep  = "copy" with sub-state "approved" (closest
 *                          analog for in-flight runs per spec § Migration)
 *   - Batch.currentHolder = client.assignedAmId ?? contentRun.triggeredById
 *   - Batch.currentRole  = "am"
 *   - Posts in the run get batch.id assigned.
 *
 * Usage:
 *   npx tsx scripts/migrate-contentRun-to-batch.ts            # dry run
 *   npx tsx scripts/migrate-contentRun-to-batch.ts --apply    # write
 */
import { db } from '@/db/client'
import { RelayRole, RelayStep } from '@prisma/client'

async function main() {
  const apply = process.argv.includes('--apply')
  const mode = apply ? 'APPLY' : 'DRY RUN'

  const runs = await db.contentRun.findMany({
    select: {
      id: true,
      clientId: true,
      targetMonth: true,
      triggeredById: true,
      client: { select: { id: true, name: true, assignedAmId: true } },
      _count: { select: { posts: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[${mode}] Found ${runs.length} ContentRun rows.`)

  let created = 0
  let skipped = 0
  let postsAssigned = 0

  for (const run of runs) {
    const existing = await db.batch.findFirst({
      where: { clientId: run.clientId, label: run.targetMonth },
      select: { id: true },
    })
    if (existing) {
      console.log(
        `  · skip ${run.client.name} ${run.targetMonth} — batch ${existing.id} already exists`,
      )
      skipped += 1
      if (apply) {
        const updated = await db.post.updateMany({
          where: { contentRunId: run.id, batchId: null },
          data: { batchId: existing.id },
        })
        if (updated.count > 0) {
          console.log(`    ↳ backfilled ${updated.count} post.batchId`)
          postsAssigned += updated.count
        }
      }
      continue
    }

    const holderId = run.client.assignedAmId ?? run.triggeredById
    console.log(
      `  · create ${run.client.name} ${run.targetMonth} (${run._count.posts} posts) → holder ${holderId}`,
    )
    if (!apply) {
      created += 1
      continue
    }

    const batch = await db.batch.create({
      data: {
        clientId: run.clientId,
        label: run.targetMonth,
        currentStep: RelayStep.copy,
        currentSubState: 'approved',
        currentHolder: holderId,
        currentRole: RelayRole.am,
      },
      select: { id: true },
    })
    created += 1

    const updated = await db.post.updateMany({
      where: { contentRunId: run.id, batchId: null },
      data: { batchId: batch.id },
    })
    postsAssigned += updated.count
    console.log(`    ↳ batch ${batch.id}, ${updated.count} posts assigned`)
  }

  console.log('')
  console.log(`[${mode}] done.`)
  console.log(`  created: ${created}`)
  console.log(`  skipped: ${skipped}`)
  console.log(`  posts.batchId backfilled: ${postsAssigned}`)
  if (!apply) {
    console.log('')
    console.log('Run again with --apply to write.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
