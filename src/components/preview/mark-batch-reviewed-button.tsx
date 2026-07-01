'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markBatchReviewedAction } from '@/server/actions/relay'

export interface MarkBatchReviewedButtonProps {
  batchId: string
  /** Open-thread count across all posts in the batch. Gates the button. */
  openThreadCount: number
  className?: string
}

/**
 * Gated relay completion on /preview.
 *
 * The button is disabled while any thread on the batch is still open; a hint
 * explains why. Once everything is resolved it advances the relay forward via
 * `markBatchReviewedAction` (which re-checks the gate server-side). No reason,
 * no force-advance -- the admin force-step is the emergency escape hatch.
 */
export function MarkBatchReviewedButton({
  batchId,
  openThreadCount,
  className,
}: MarkBatchReviewedButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const blocked = openThreadCount > 0

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
          Resolve {openThreadCount} open thread{openThreadCount === 1 ? '' : 's'}{' '}
          to mark reviewed
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
