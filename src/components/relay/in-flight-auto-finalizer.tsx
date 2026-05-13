'use client'

import { useEffect, useRef } from 'react'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'
import { buildBatchLabel } from '@/lib/batch-target-month'
import { useCompletionNotifications } from '@/components/relay/completion-notifications'

/**
 * Watches for completed runs and auto-finalizes them based on targetBatchId:
 *
 *   - targetBatchId set     -> finalize choice='replace' against that batch (atomic swap)
 *   - targetBatchId null, no matchingBatch -> finalize choice='new' (auto-label)
 *   - targetBatchId null, matchingBatch exists -> defer to InFlightChoiceModal (legacy path)
 *
 * The third case preserves the rolling deprecation window: existing sessions
 * that opened the choice modal before targetBatchId was introduced will not
 * have their modal silently bypassed.
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
      // Route by targetBatchId:
      //   - set     -> finalize choice='replace' against the target (atomic swap)
      //   - null    -> if no matching batch, finalize choice='new' (auto-label)
      //   - null    -> if matchingBatch exists, defer to InFlightChoiceModal (legacy)
      let payload:
        | { choice: 'replace'; runId: string; batchId: string }
        | { choice: 'new'; runId: string; label: string }
        | null = null

      if (run.targetBatchId) {
        payload = { choice: 'replace', runId: run.id, batchId: run.targetBatchId }
      } else if (!run.matchingBatch) {
        payload = {
          choice: 'new',
          runId: run.id,
          label: buildBatchLabel(run.clientName, run.targetMonth),
        }
      }

      if (!payload) return // legacy modal handles this case

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
