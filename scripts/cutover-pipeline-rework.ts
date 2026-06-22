/**
 * One-off cutover for the pipeline rework (2026-06-22).
 * Moves in-flight batches off the retired steps onto the merged steps,
 * re-pins currentRole, and reseeds their checklist.
 *   sent_to_client | client_decision      -> client_review
 *   ready_to_schedule | final_qa_schedule  -> scheduling
 *
 * Usage:
 *   tsx scripts/cutover-pipeline-rework.ts            (dry run, no writes)
 *   tsx scripts/cutover-pipeline-rework.ts --apply    (writes)
 *
 * Run against prod with: `vercel env pull` as accountsfon, dry run first,
 * confirm the count matches the read-only pre-count, then `--apply`, then
 * re-run the dry run to confirm 0 remaining, then shred the env file.
 *
 * Spec: projects/relay-app/2026-06-22-pipeline-rework-design.md
 */
import { db } from '@/db/client'
import { RelayStep } from '@prisma/client'
import { HOLDER_ROLE, reseedChecklistForStep } from '@/server/lib/relay-state-machine'

const MOVES: Partial<Record<RelayStep, RelayStep>> = {
  [RelayStep.sent_to_client]: RelayStep.client_review,
  [RelayStep.client_decision]: RelayStep.client_review,
  [RelayStep.ready_to_schedule]: RelayStep.scheduling,
  [RelayStep.final_qa_schedule]: RelayStep.scheduling,
}

async function main() {
  const apply = process.argv.includes('--apply')
  const batches = await db.batch.findMany({
    where: {
      currentStep: {
        in: [
          RelayStep.sent_to_client,
          RelayStep.client_decision,
          RelayStep.ready_to_schedule,
          RelayStep.final_qa_schedule,
        ],
      },
    },
    select: { id: true, currentStep: true, clientReviewEnabled: true, label: true },
  })
  console.log(`Found ${batches.length} in-flight batches to move (apply=${apply})`)
  for (const b of batches) {
    const toStep = MOVES[b.currentStep]
    if (!toStep) continue
    console.log(`  ${b.label} (${b.id}): ${b.currentStep} -> ${toStep}`)
    if (!apply) continue
    await db.$transaction(async (tx) => {
      await tx.batch.update({
        where: { id: b.id },
        data: { currentStep: toStep, currentRole: HOLDER_ROLE[toStep], currentSubState: null },
      })
      await reseedChecklistForStep(tx, b.id, toStep, b.clientReviewEnabled)
    })
  }
  console.log(apply ? 'Cutover applied.' : 'Dry run complete (no writes).')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
