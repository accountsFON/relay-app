'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markBatchReviewedAction } from '@/server/actions/relay'

export interface MarkBatchReviewedButtonProps {
  batchId: string
  /** Open-thread count across all posts in the batch. Gates the button. */
  openThreadCount: number
  /** False when the current step has ≠1 forward edge (can't auto-advance). Default true. */
  canAdvance?: boolean
  className?: string
}

/**
 * Gated relay completion on /preview.
 *
 * The button is disabled while any thread on the batch is still open; a hint
 * explains why. Once everything is resolved it advances the relay forward via
 * `markBatchReviewedAction` (which re-checks the gate server-side). No reason,
 * no force-advance -- the admin force-step is the emergency escape hatch.
 *
 * Also disabled when the current step has more than one forward edge, since
 * auto-advance requires exactly one path forward.
 */
export function MarkBatchReviewedButton({
  batchId,
  openThreadCount,
  canAdvance = true,
  className,
}: MarkBatchReviewedButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const gatedByThreads = openThreadCount > 0
  const gatedByBranch = canAdvance === false
  const blocked = gatedByThreads || gatedByBranch

  function handleClick() {
    if (blocked) return
    setError(null)
    startTransition(async () => {
      try {
        await markBatchReviewedAction({ batchId })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to advance relay')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={handleClick}
        disabled={blocked || isPending}
        data-testid="mark-batch-reviewed-button"
        className={className}
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{isPending ? 'Advancing...' : 'Mark relay reviewed'}</span>
      </Button>
      {blocked && (
        <p
          data-testid="mark-batch-reviewed-hint"
          className="text-[11px] text-muted-foreground"
        >
          {gatedByThreads
            ? `Resolve ${openThreadCount} open thread${openThreadCount === 1 ? '' : 's'} to mark reviewed`
            : "This step can't auto-advance. Advance it from the relay page."}
        </p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="mark-batch-reviewed-error"
          className="text-[11px] text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
