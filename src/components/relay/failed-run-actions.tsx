'use client'

import { useState } from 'react'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { retryFailedRunAction, acknowledgeFailedRunAction } from '@/server/actions/in-flight-runs'

export interface FailedRunActionsProps {
  runId: string
  onRetried?: () => void
  onDismissed?: () => void
}

export function FailedRunActions({ runId, onRetried, onDismissed }: FailedRunActionsProps) {
  const { refresh } = useInFlightRuns()
  const [pending, setPending] = useState<'retry' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRetry = async () => {
    setPending('retry')
    setError(null)
    try {
      await retryFailedRunAction(runId)
      await refresh()
      onRetried?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed')
      setPending(null)
    }
  }

  const handleDismiss = async () => {
    setPending('dismiss')
    setError(null)
    try {
      await acknowledgeFailedRunAction(runId)
      await refresh()
      onDismissed?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed')
      setPending(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={handleRetry}
          disabled={pending !== null}
          className="text-[12px] text-foreground hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {pending === 'retry' ? 'Retrying…' : 'Retry'}
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          onClick={handleDismiss}
          disabled={pending !== null}
          className="text-[12px] text-muted-foreground hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
    </>
  )
}
