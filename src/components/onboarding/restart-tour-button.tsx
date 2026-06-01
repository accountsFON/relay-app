'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RestartTourButtonProps = {
  /** Optional override for the reset POST. Used by tests. */
  onReset?: () => Promise<void> | void
  className?: string
}

/**
 * "Restart guided tour" control rendered on /settings/org. Clears
 * both User.onboardingTourSeenAt and User.launchPadDismissedAt via
 * POST /api/onboarding/reset, then navigates to /welcome so the user
 * lands back on the launch pad.
 *
 * Disabled state while the request is in flight so a rapid double
 * click does not flap the columns. On failure we surface a tiny
 * error message and re enable the button; the user can try again
 * without leaving the page.
 *
 * Phase 4 item 25.
 */
export function RestartTourButton({ onReset, className }: RestartTourButtonProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (onReset) {
        await onReset()
      } else {
        const res = await fetch('/api/onboarding/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (!res.ok) {
          throw new Error(`reset failed with ${res.status}`)
        }
      }
      router.push('/welcome')
      router.refresh()
    } catch (err) {
      console.error('[restart-tour-button] reset failed', err)
      setError('Could not restart the tour. Try again in a moment.')
      setBusy(false)
    }
  }, [onReset, router])

  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <button
        type="button"
        data-testid="restart-tour-button"
        disabled={busy}
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RotateCcw aria-hidden className="size-4" />
        {busy ? 'Restarting...' : 'Restart guided tour'}
      </button>
      {error && (
        <p data-testid="restart-tour-button-error" className="text-xs text-coral-600">
          {error}
        </p>
      )}
    </div>
  )
}
