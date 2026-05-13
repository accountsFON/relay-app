'use client'

import { useEffect, useRef } from 'react'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'
import { buildBatchLabel } from '@/lib/batch-target-month'
import { useCompletionNotifications } from '@/components/relay/completion-notifications'

/**
 * Watches for completed runs that have no matching batch (first-time generation
 * for a client+month) and silently auto-creates a new batch for them.
 *
 * Restores the auto-new fallback behavior the old generate-content-dialog used
 * to perform -- that code was removed in PR #56's simplification, leaving runs
 * orphaned in the awaiting_choice state.
 */
export function InFlightAutoFinalizer() {
  const { runs, refresh } = useInFlightRuns()
  const { push } = useCompletionNotifications()
  const finalizingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const needsAutoNew = runs.filter(
      (r) =>
        r.intent === 'awaiting_choice' &&
        !r.matchingBatch &&
        !finalizingRef.current.has(r.id)
    )

    needsAutoNew.forEach(async (run) => {
      finalizingRef.current.add(run.id)
      try {
        const result = await finalizePostGenerationAction({
          choice: 'new',
          runId: run.id,
          label: buildBatchLabel(run.clientName, run.targetMonth),
        })
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
  }, [runs, refresh])

  return null
}
