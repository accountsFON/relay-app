'use client'

/**
 * AutoAdvanceToggle: lets an AM or admin opt a relay out of the daily
 * auto-advance cron while it sits in Client Review.
 *
 * When off, the relay waits for the client indefinitely instead of being
 * advanced to Scheduling after the org's review window expires.
 *
 * Rendered by ChecklistPanel when the relay is at client_review and
 * clientReviewEnabled is true. Invisible to designers and clients (their
 * canAct logic prevents them from reaching this panel in that configuration).
 */

import { useState, useTransition } from 'react'
import { Switch } from '@/components/ui/switch'
import { setBatchAutoAdvanceAction } from '@/server/actions/relay'

interface AutoAdvanceToggleProps {
  batchId: string
  clientId: string
  /** Current persisted value of Batch.autoAdvanceOnTimeout. */
  autoAdvanceOnTimeout: boolean
}

export function AutoAdvanceToggle({
  batchId,
  clientId,
  autoAdvanceOnTimeout,
}: AutoAdvanceToggleProps) {
  const [checked, setChecked] = useState(autoAdvanceOnTimeout)
  const [isPending, startTransition] = useTransition()

  function onCheckedChange(next: boolean) {
    setChecked(next)
    startTransition(async () => {
      try {
        await setBatchAutoAdvanceAction({ batchId, clientId, enabled: next })
      } catch {
        // Roll back optimistic update on failure.
        setChecked(!next)
      }
    })
  }

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={isPending}
          aria-label="Auto-advance if the client doesn't respond"
        />
        <span className="text-[13px] text-foreground">
          Auto-advance if the client doesn&apos;t respond
        </span>
      </label>
      <p className="text-[11px] text-muted-foreground pl-11">
        When off, this relay waits for the client indefinitely.
      </p>
    </div>
  )
}
