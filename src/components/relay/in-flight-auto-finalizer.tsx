'use client'

import { useEffect, useRef } from 'react'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'
import { buildBatchLabel } from '@/lib/batch-target-month'
import { useCompletionNotifications } from '@/components/relay/completion-notifications'

/**
 * Watches for completed runs and auto-finalizes them. The legacy
 * InFlightChoiceModal was removed in a follow-up to PR #76 once retry,
 * regenerate, and bulk-gen all started resolving targetBatchId at
 * kickoff via findMatchingBatchForClientMonth. With no flow producing
 * `targetBatchId=null + matchingBatch` as an intentional state, this
 * component is now the only finalization path for completed runs.
 *
 *   - targetBatchId set                  -> 'replace' against that batch
 *   - targetBatchId null + matching      -> 'replace' against the match
 *     (covers the rare race where a matching batch appears between
 *     probe and completion; mirrors what the user would have picked
 *     in the pre-flight Replace flow)
 *   - targetBatchId null + no matching   -> 'new' (auto-label)
 */
export function InFlightAutoFinalizer() {
  const { runs, refresh } = useInFlightRuns()
  const { push } = useCompletionNotifications()
  const finalizingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const awaitingComplete = runs.filter(
      (r) => r.intent === 'awaiting_choice' && !finalizingRef.current.has(r.id),
    )

    awaitingComplete.forEach(async (run) => {
      let payload:
        | { choice: 'replace'; runId: string; batchId: string }
        | { choice: 'new'; runId: string; label: string }

      if (run.targetBatchId) {
        payload = { choice: 'replace', runId: run.id, batchId: run.targetBatchId }
      } else if (run.matchingBatch) {
        // No explicit targetBatchId (rare race between probe and
        // completion). Default to replacing the matching batch — this
        // matches the user's intent in the pre-flight Replace flow.
        payload = {
          choice: 'replace',
          runId: run.id,
          batchId: run.matchingBatch.batchId,
        }
      } else {
        payload = {
          choice: 'new',
          runId: run.id,
          label: buildBatchLabel(run.clientName, run.targetMonth),
        }
      }

      finalizingRef.current.add(run.id)
      try {
        const result = await finalizePostGenerationAction(payload)
        if (!result.alreadyFinalized) {
          push({
            clientName: run.clientName,
            targetMonth: run.targetMonth,
            clientId: run.clientId,
            batchId: result.batchId,
          })
        }
        await refresh()
      } catch (e) {
        console.error('Auto-finalize failed for run', run.id, e)
        // Allow retry on the next polling tick.
        finalizingRef.current.delete(run.id)
      }
    })
  }, [runs, refresh, push])

  return null
}
