'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'
import { buildBatchLabel, formatMonthYear } from '@/lib/batch-target-month'
import { useCompletionNotifications } from '@/components/relay/completion-notifications'

export function InFlightChoiceModal() {
  const { runs, refresh } = useInFlightRuns()
  const { push } = useCompletionNotifications()
  // Per-session set of run IDs the user has dismissed (ESC / click-outside / X).
  // Stored in a ref so it persists across re-renders without causing extra renders.
  // Per-component-instance memory. Not persisted to localStorage — intentionally
  // resets on AppShell remount (e.g., navigation across protected routes).
  // Runs that remain awaiting_choice after a nav round-trip will re-prompt, which
  // is correct given the 2s polling cadence.
  const dismissedRef = useRef<Set<string>>(new Set())
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Controls the dialog's open state independently of the provider list,
  // so ESC can close it immediately while the run stays in the provider.
  const [isOpen, setIsOpen] = useState(false)

  const awaiting = runs
    .filter((r) => r.intent === 'awaiting_choice' && !dismissedRef.current.has(r.id))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  const current = awaiting[0] ?? null

  const currentId = current?.id ?? null
  const hasMatchingBatch = !!current?.matchingBatch

  // Open the dialog whenever a new awaiting run becomes the current one.
  useEffect(() => {
    if (currentId && hasMatchingBatch) {
      setIsOpen(true)
      setError(null)
    } else {
      setIsOpen(false)
    }
  }, [currentId, hasMatchingBatch])

  const handleChoice = async (choice: 'add' | 'replace' | 'new') => {
    if (!current || !current.matchingBatch) return
    setIsFinalizing(true)
    setError(null)
    try {
      let result: { batchId: string; alreadyFinalized?: true }
      if (choice === 'new') {
        result = await finalizePostGenerationAction({
          choice: 'new',
          runId: current.id,
          label: buildBatchLabel(current.clientName, current.targetMonth),
        })
      } else {
        result = await finalizePostGenerationAction({
          choice,
          runId: current.id,
          batchId: current.matchingBatch.batchId,
        })
      }
      if (!result.alreadyFinalized) {
        push({
          clientName: current.clientName,
          targetMonth: current.targetMonth,
          clientId: current.clientId,
          batchId: result.batchId,
        })
      }
      // Close immediately on success. If refresh fails, the user is not stranded.
      dismissedRef.current.add(current.id)
      setIsOpen(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize')
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && current) {
      // Mark this run as session-dismissed so it won't auto-reopen.
      dismissedRef.current.add(current.id)
      setIsOpen(false)
      setError(null)
    }
  }

  if (!current || !current.matchingBatch) return null

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Content ready for {current.clientName} ({formatMonthYear(current.targetMonth)})
          </DialogTitle>
          <DialogDescription>
            A batch already exists for this client and month with {current.matchingBatch.postCount} post
            {current.matchingBatch.postCount === 1 ? '' : 's'}. What do you want to do with the new
            posts?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Button
            onClick={() => handleChoice('add')}
            disabled={isFinalizing}
            className="w-full justify-start"
          >
            Add to existing batch ({current.matchingBatch.label})
          </Button>
          <Button
            onClick={() => handleChoice('replace')}
            disabled={isFinalizing}
            variant="outline"
            className="w-full justify-start"
          >
            Replace existing batch
          </Button>
          <Button
            onClick={() => handleChoice('new')}
            disabled={isFinalizing}
            variant="ghost"
            className="w-full justify-start"
          >
            Start a new batch
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
