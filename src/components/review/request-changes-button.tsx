'use client'

/**
 * RequestChangesButton: the AM's in-step control on the /preview surface.
 * Runs the passed server action (sets awaiting_design_revisions + notifies the
 * assigned designer; the batch stays at am_review_design, AM-held), then shows
 * a clear confirmation that the designer was notified.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

export interface RequestChangesButtonProps {
  /** Server action that sets awaiting_design_revisions + notifies designer. */
  onClick: () => Promise<void>
  /** Assigned designer's display name, for the "notified" confirmation. */
  designerName?: string | null
  disabled?: boolean
}

export function RequestChangesButton({
  onClick,
  designerName,
  disabled,
}: RequestChangesButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        await onClick()
        setSent(true)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to request changes',
        )
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="default"
        onClick={handleClick}
        disabled={disabled || isPending || sent}
        data-testid="request-changes-button"
      >
        {isPending ? 'Requesting...' : 'Request changes'}
      </Button>
      {sent && (
        <p
          data-testid="request-changes-success"
          className="text-[11px] text-muted-foreground"
        >
          {designerName
            ? `Sent to ${designerName}. They've been notified.`
            : 'Changes requested. No designer is assigned to notify.'}
        </p>
      )}
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
