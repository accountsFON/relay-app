'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Post-level "Mark addressed" button for the review session detail page.
 * Wraps a server action passed by the page in a transition + error surface.
 * Distinct from ReviewItemRow's own (item-only) Mark Addressed: this one
 * clears the whole post (item + client pins) via markPostAddressedAction.
 */
export function MarkAddressedButton({
  onClick,
  label = 'Mark addressed',
}: {
  onClick: () => Promise<void>
  label?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="default"
        size="sm"
        data-testid="mark-post-addressed-button"
        disabled={isPending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              await onClick()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Action failed')
            }
          })
        }}
      >
        {isPending ? 'Saving…' : label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
