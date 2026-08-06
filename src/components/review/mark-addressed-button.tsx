'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { REVIEW_TOOLTIP_COPY } from '@/lib/review-tooltip-copy'

/**
 * Post-level "Mark addressed" button for the review session detail page.
 * Wraps a server action passed by the page in a transition + error surface.
 * Distinct from ReviewItemRow's own (item-only) Mark Addressed: this one
 * clears the whole post (item + client pins) via markPostAddressedAction.
 */
export function MarkAddressedButton({
  onClick,
  label = 'Mark addressed',
  variant = 'default',
  testId = 'mark-post-addressed-button',
}: {
  onClick: () => Promise<void>
  label?: string
  variant?: 'default' | 'outline'
  testId?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <SimpleTooltip content={REVIEW_TOOLTIP_COPY.markAddressed}>
        <Button
          variant={variant}
          size="sm"
          data-testid={testId}
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
      </SimpleTooltip>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
