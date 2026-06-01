'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTourController } from '@/components/onboarding/tour-provider'

export type LaunchPadCard = {
  id: string
  title: string
  body: string
  href: string
  cta: string
}

export type WelcomeLaunchPadProps = {
  cards: LaunchPadCard[]
  /**
   * If the designer persona has a real batch to jump into, the server
   * page passes the deep link href. Used to override the second + third
   * designer card hrefs so the CTAs land somewhere useful. AM cards
   * ignore this prop.
   */
  designerJumpHref?: string | null
  /**
   * Optional override for the dismiss POST. Tests inject a stub so the
   * component does not need a real fetch implementation.
   */
  onDismiss?: () => Promise<void> | void
  className?: string
}

/**
 * Launch pad surface body. Renders the role gated card grid plus the
 * "Take the 60 second product tour" CTA and the "Skip, I'll explore"
 * link. All three dismissal paths (clicking a card, tapping Skip,
 * tapping Take the tour) POST /api/onboarding/launch-pad-dismissed so
 * the layout redirect predicate no longer matches on the next request.
 *
 * "Take the tour" additionally calls into the TourProvider via
 * useTourController().start() and navigates the user to /dashboard
 * where the tour anchors live. The TourProvider sees start() and
 * renders the popover on top of the dashboard.
 *
 * Phase 4 item 25.
 */
export function WelcomeLaunchPad({
  cards,
  designerJumpHref,
  onDismiss,
  className,
}: WelcomeLaunchPadProps) {
  const router = useRouter()
  const tour = useTourController()
  const [dismissed, setDismissed] = useState(false)

  const persistDismiss = useCallback(async () => {
    if (dismissed) return
    setDismissed(true)
    if (onDismiss) {
      try {
        await onDismiss()
      } catch (err) {
        console.error('[welcome-launch-pad] onDismiss threw', err)
      }
      return
    }
    try {
      await fetch('/api/onboarding/launch-pad-dismissed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch (err) {
      // Optimistic dismiss: a failed POST means the launch pad may
      // re-fire on next sign in. Acceptable per the design.
      console.error('[welcome-launch-pad] dismiss POST threw', err)
    }
  }, [dismissed, onDismiss])

  const handleCardClick = useCallback(
    (card: LaunchPadCard) => {
      void persistDismiss()
      const href =
        designerJumpHref && (card.id === 'edit-graphic' || card.id === 'pass-to-am')
          ? designerJumpHref
          : card.href
      router.push(href)
    },
    [persistDismiss, designerJumpHref, router],
  )

  const handleTakeTour = useCallback(() => {
    void persistDismiss()
    tour.start()
    router.push('/dashboard')
  }, [persistDismiss, tour, router])

  const handleSkip = useCallback(() => {
    void persistDismiss()
    router.push('/dashboard')
  }, [persistDismiss, router])

  return (
    <div
      data-testid="welcome-launch-pad"
      className={cn('mt-8 space-y-8', className)}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            data-testid={`welcome-launch-pad-card-${card.id}`}
            onClick={() => handleCardClick(card)}
            className="group flex h-full flex-col items-start gap-3 rounded-2xl border border-neutral-200 bg-card p-5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <h3 className="text-base font-semibold text-foreground">{card.title}</h3>
            <p className="flex-1 text-sm text-muted-foreground">{card.body}</p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 group-hover:text-blue-700">
              {card.cta}
              <ArrowRight aria-hidden className="size-4" />
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col items-start gap-3 rounded-2xl bg-neutral-100 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Take the 60 second product tour
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Three quick stops, then you are off the rails.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            data-testid="welcome-launch-pad-skip"
            onClick={handleSkip}
            className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Skip, I&apos;ll explore
          </button>
          <button
            type="button"
            data-testid="welcome-launch-pad-take-tour"
            onClick={handleTakeTour}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Take the tour
            <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {/* Quiet escape hatch for users who want to find the launch pad
          later — the Settings page Restart guided tour control does the
          same thing in reverse. */}
      <p className="text-xs text-muted-foreground">
        You can restart this tour anytime from{' '}
        <Link href="/settings/org" className="underline underline-offset-2 hover:text-foreground">
          Settings
        </Link>
        .
      </p>
    </div>
  )
}
