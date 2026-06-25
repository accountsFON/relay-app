'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TourStop = {
  /** Stable id used by tests + the provider's step index. */
  id: string
  /** DOM selector for the anchor element. Tour mounts near it. */
  anchorSelector: string
  /** Heading shown above the body copy. */
  title: string
  /** Body copy. Plain string; tour is intentionally simple. */
  body: string
}

export type TourPopoverProps = {
  /** Ordered list of stops. The popover renders the one at currentIndex. */
  stops: TourStop[]
  /** Which stop is showing right now. Driven by the parent provider. */
  currentIndex: number
  /** Advance to the next stop (or finish if on the last one). */
  onNext: () => void
  /** Skip the whole tour. Wired to permanent dismissal in the parent. */
  onSkip: () => void
  /** Optional close handler bound to the top right X + ESC. */
  onClose?: () => void
  className?: string
}

const FALLBACK_POSITION = { top: 96, left: 96 } as const
/** Padding around the target rect for the spotlight cutout. */
const SPOTLIGHT_PAD = 6

type Spotlight = { top: number; left: number; width: number; height: number }

/**
 * Lightweight popover that anchors itself to a DOM node by selector and
 * renders a guided tour with a spotlight (dim the page + bright cutout + ring
 * around the target). No positioning library; a getBoundingClientRect read is
 * enough.
 *
 * Stable test ids: container `tour-popover`, per stop `tour-popover-stop-${id}`,
 * spotlight `tour-popover-spotlight`.
 *
 * Positioning: a rAF loop tracks the target rect so the popover + spotlight
 * stay glued as the page scrolls or the target moves. Two deliberate choices
 * keep scroll smooth: (1) state only updates when the geometry actually
 * changes, so a still page does not re-render every frame; (2) the spotlight
 * has NO CSS transition, so it snaps to the target each frame instead of
 * sliding behind it during a scroll. When the active stop changes we scroll
 * its target into view (instant — smooth scrollIntoView is a no-op inside this
 * app's overflow containers, see PR #243) so advancing the tour always brings
 * the next highlight on screen. Missing target (concept stop) -> popover
 * centers via the fallback and no spotlight renders.
 */
export function TourPopover({
  stops,
  currentIndex,
  onNext,
  onSkip,
  onClose,
  className,
}: TourPopoverProps) {
  const stop = stops[currentIndex]
  const [position, setPosition] = useState<{ top: number; left: number }>(
    FALLBACK_POSITION,
  )
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null)
  // Last-applied geometry, so the rAF loop only calls setState when something
  // actually moved (avoids a React re-render on every animation frame).
  const lastPos = useRef<{ top: number; left: number }>(FALLBACK_POSITION)
  const lastSpot = useRef<Spotlight | null>(null)

  // When the active stop changes, bring its target on screen so advancing the
  // tour never highlights something below the fold. Instant scroll: smooth is
  // a no-op in this app's scroll containers (PR #243).
  useEffect(() => {
    if (!stop) return
    const target = document.querySelector(stop.anchorSelector)
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }, [stop])

  // Track the target every frame so the popover + spotlight follow it during
  // scroll / layout shifts. Commit to state only when the geometry changes.
  useLayoutEffect(() => {
    if (!stop) return
    let frame = 0
    const update = () => {
      const target = document.querySelector(stop.anchorSelector)
      if (!target) {
        if (lastSpot.current !== null) {
          lastSpot.current = null
          setSpotlight(null)
        }
        if (
          lastPos.current.top !== FALLBACK_POSITION.top ||
          lastPos.current.left !== FALLBACK_POSITION.left
        ) {
          lastPos.current = FALLBACK_POSITION
          setPosition(FALLBACK_POSITION)
        }
        frame = requestAnimationFrame(update)
        return
      }
      const rect = target.getBoundingClientRect()
      const popoverHeight = 200
      const margin = 12
      const placeBelow =
        rect.bottom + popoverHeight + margin < window.innerHeight
      const top = placeBelow
        ? rect.bottom + margin
        : Math.max(margin, rect.top - popoverHeight - margin)
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - 320 - margin),
      )
      if (lastPos.current.top !== top || lastPos.current.left !== left) {
        lastPos.current = { top, left }
        setPosition({ top, left })
      }
      const next: Spotlight = {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
      const prev = lastSpot.current
      if (
        !prev ||
        prev.top !== next.top ||
        prev.left !== next.left ||
        prev.width !== next.width ||
        prev.height !== next.height
      ) {
        lastSpot.current = next
        setSpotlight(next)
      }
      frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [stop])

  // ESC dismisses; mirrors the review tutorial modal pattern.
  useEffect(() => {
    if (!stop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stop, onClose])

  if (!stop) return null

  const isLast = currentIndex >= stops.length - 1
  const stepLabel = `${currentIndex + 1} of ${stops.length}`

  return (
    <>
      {spotlight && (
        <div
          data-testid="tour-popover-spotlight"
          aria-hidden
          className="pointer-events-none fixed z-[55] rounded-lg"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow:
              '0 0 0 9999px rgba(2, 6, 23, 0.6), 0 0 0 3px rgba(255, 255, 255, 0.95)',
          }}
        />
      )}
      <div
        data-testid="tour-popover"
        role="dialog"
        aria-modal="false"
        aria-labelledby={`tour-popover-title-${stop.id}`}
        className={cn(
          // z-[60] keeps the popover above the open mobile sidebar (z-50).
          'fixed z-[60] w-[320px] rounded-2xl bg-card p-5 shadow-xl ring-1 ring-neutral-200',
          className,
        )}
        style={{ top: position.top, left: position.left }}
      >
        <div data-testid={`tour-popover-stop-${stop.id}`} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Step {stepLabel}
              </p>
              <h2
                id={`tour-popover-title-${stop.id}`}
                className="mt-0.5 text-base font-semibold text-foreground"
              >
                {stop.title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close tour"
              data-testid="tour-popover-close"
              onClick={() => onClose?.()}
              className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          <p className="text-sm text-foreground">{stop.body}</p>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              data-testid="tour-popover-skip"
              onClick={onSkip}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Skip the tour
            </button>
            <button
              type="button"
              data-testid="tour-popover-next"
              onClick={onNext}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
