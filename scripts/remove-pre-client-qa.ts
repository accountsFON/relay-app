/**
 * One-off migration for the Pre-Client QA removal (P1 #13).
 * Moves any in-flight batch still sitting at the retired `am_qa_pre_client`
 * step back to `am_review_design`, re-pins currentRole, and reseeds its
 * checklist so the AM re-runs the new confirm-modal flow.
 *   am_qa_pre_client -> am_review_design
 *
 * Usage:
 *   tsx scripts/remove-pre-client-qa.ts            (dry run, no writes)
 *   tsx scripts/remove-pre-client-qa.ts --apply    (writes)
 *
 * Run against prod with: `vercel env pull` as accountsfon, dry run first,
 * confirm the count matches the read-only pre-count, then `--apply`, then
 * re-run the dry run to confirm 0 remaining, then shred the env file.
 */
import { db } from '@/db/client'
import { RelayStep } from '@prisma/client'
import { HOLDER_ROLE, reseedChecklistForStep } from '@/server/lib/relay-state-machine'

async function main() {
  const apply = process.argv.includes('--apply')
  const batches = await db.batch.findMany({
    where: { currentStep: RelayStep.am_qa_pre_client },
    select: { id: true, currentStep: true, clientReviewEnabled: true, label: true },
  })
  console.log(`Found ${batches.length} stuck Pre-Client QA batches to move (apply=${apply})`)
  for (const b of batches) {
    console.log(`  ${b.label} (${b.id}): am_qa_pre_client -> am_review_design`)
    if (!apply) continue
    await db.$transaction(async (tx) => {
      await tx.batch.update({
        where: { id: b.id },
        data: {
          currentStep: RelayStep.am_review_design,
          currentRole: HOLDER_ROLE[RelayStep.am_review_design],
          currentSubState: null,
        },
      })
      await reseedChecklistForStep(tx, b.id, RelayStep.am_review_design, b.clientReviewEnabled)
    })
  }
  console.log(apply ? 'Migration applied.' : 'Dry run complete (no writes).')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
