'use client'

/**
 * MarkRevisionsDoneButton: the designer's respond control on the internal
 * review read-back. Clears the `awaiting_design_revisions` sub-state and
 * notifies the AM so they can open the next round and re-review.
 *
 * Internal review parity Phase 3. The inverse of the AM's "Request changes"
 * control. Rendered only for the assigned designer while the batch is at
 * am_review_design / awaiting_design_revisions (gated by the page).
 *
 * Mirrors StartNextRoundButton: a thin client wrapper that runs the passed
 * server action inside a transition and surfaces a soft error.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

export interface MarkRevisionsDoneButtonProps {
  /** Server action that clears the sub-state + notifies the AM. */
  onClick: () => Promise<void>
  /** Disabled while ineligible (page should not render it then, but defend). */
  disabled?: boolean
  /** Open-thread count across all posts in the batch. Gates the button. */
  openThreadCount?: number
}

export function MarkRevisionsDoneButton({
  onClick,
  disabled,
  openThreadCount,
}: MarkRevisionsDoneButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const gatedByThreads = (openThreadCount ?? 0) > 0
  const blocked = gatedByThreads || disabled

  function handleClick() {
    if (blocked) return
    setError(null)
    startTransition(async () => {
      try {
        await onClick()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to mark revisions done',
        )
      }
    })
  }

  return (
    <div className="mb-4 space-y-2">
      <Button
        variant="default"
        size="default"
        onClick={handleClick}
        disabled={blocked || isPending}
        data-testid="mark-revisions-done-button"
      >
        {isPending ? 'Submitting…' : 'Mark revisions done'}
      </Button>
      {gatedByThreads && (
        <p
          data-testid="mark-revisions-done-hint"
          className="text-[11px] text-muted-foreground"
        >
          Resolve {openThreadCount} open thread{openThreadCount === 1 ? '' : 's'} before marking revisions done
        </p>
      )}
      {error && (
        <p
          role="alert"
          data-testid="mark-revisions-done-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
