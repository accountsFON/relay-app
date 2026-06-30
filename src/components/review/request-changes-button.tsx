'use client'

/**
 * RequestChangesButton: the AM's in-step control on the /preview surface.
 * Sets the batch sub-state to `awaiting_design_revisions` and notifies the
 * assigned designer; the batch stays at am_review_design, AM-held.
 *
 * Rendered only for the AM while the batch is at am_review_design (gated by
 * the page). Mirrors MarkRevisionsDoneButton: a thin client wrapper that runs
 * the passed server action inside a transition and surfaces a soft error.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

export interface RequestChangesButtonProps {
  /** Server action that sets awaiting_design_revisions + notifies designer. */
  onClick: () => Promise<void>
  disabled?: boolean
}

export function RequestChangesButton({
  onClick,
  disabled,
}: RequestChangesButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        await onClick()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to request changes',
        )
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="default"
        onClick={handleClick}
        disabled={disabled || isPending}
        data-testid="request-changes-button"
      >
        {isPending ? 'Requesting…' : 'Request changes'}
      </Button>
      {error && (
        <p
          role="alert"
          data-testid="request-changes-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
