'use client'

/**
 * StartNextRoundButton: closes the current submitted review session and opens
 * round N+1 for the same magic link reviewer. Rendered on the AM-side review
 * session detail page once every non-approved item has been addressed.
 *
 * The actual server action is wired in Layer 3 task 3.4. For Layer 2 the
 * parent passes either no handler (logs to console) or a stubbed function.
 *
 * Spec: design doc § Round 2 + plan Task 2.2 (UI), Task 3.4 (wiring).
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'

export interface StartNextRoundButtonProps {
  /** ID of the magic link this session belongs to. Used by the wired action. */
  magicLinkId: string
  /** The round number that will be created (currentRound + 1). Display only. */
  nextRound: number
  /** Disabled when there are still un-addressed items. */
  disabled?: boolean
  /**
   * Optional click handler. Layer 3 task 3.4 wires the real
   * startNextRoundAction; until then the default is a console.log so the
   * button is observably wired without changing call sites later.
   */
  onClick?: () => Promise<void>
}

export function StartNextRoundButton({
  magicLinkId,
  nextRound,
  disabled,
  onClick,
}: StartNextRoundButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        if (onClick) {
          await onClick()
        } else {
          // Layer 3 task 3.4 wires this to startNextRoundAction; for now we
          // log so the affordance is observably present.
          // eslint-disable-next-line no-console
          console.log('[start-next-round-button] stub click', {
            magicLinkId,
            nextRound,
          })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start next round')
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        variant="default"
        size="default"
        onClick={handleClick}
        disabled={disabled || isPending}
        data-testid="start-next-round-button"
        data-magic-link-id={magicLinkId}
        data-next-round={nextRound}
      >
        {isPending ? 'Starting…' : `Start Round ${nextRound}`}
      </Button>
      {error && (
        <p
          role="alert"
          data-testid="start-next-round-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
