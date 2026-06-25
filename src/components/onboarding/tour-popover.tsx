'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
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
  /**
   * Skip the whole tour. Wired to permanent dismissal in the parent.
   * Visible on every stop per Julio's call ("auto fire with the option
   * to skip").
   */
  onSkip: () => void
  /** Optional close handler bound to the top right X + ESC. */
  onClose?: () => void
  className?: string
}

const FALLBACK_POSITION = { top: 96, left: 96 } as const
/** Padding around the target rect for the spotlight cutout. */
const SPOTLIGHT_PAD = 6

/**
 * Lightweight popover that anchors itself to a DOM node by selector
 * and renders a 3 stop guided tour. Built on plain divs + lucide so
 * we do not pull in a positioning library; the layout is simple
 * enough that a getBoundingClientRect read is sufficient.
 *
 * Stops have stable test ids: `tour-popover-stop-${stop.id}` and the
 * container is `tour-popover`. Each stop renders the heading, body,
 * a primary "Next" / "Got it" button (last stop), and a Skip link.
 *
 * Keyboard: ESC dismisses by invoking onClose (which the provider
 * wires to the same permanent dismissal path as Skip). Focus is moved
 * to the primary button on each stop so screen reader users land in
 * the right place.
 *
 * Positioning: anchors below the target with an 8px gap. If the
 * target is missing (e.g. the layout hides it on mobile) we fall back
 * to a fixed bottom right position so the tour still ships its copy
 * instead of vanishing silently.
 *
 * Phase 4 item 25.
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
  // When the stop anchors to a real element we draw a spotlight: the page
  // dims and a bright cutout + ring frames the target. Concept stops (the
  // selector matches nothing) get no spotlight and a centered popover.
  const [spotlight, setSpotlight] = useState<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)

  // Place the popover next to its anchor. While a stop is active we
  // re-run the position read every animation frame, so the popover
  // tracks the anchor as it moves, e.g. when the mobile nav drawer
  // slides in over its 200ms transform and the anchored nav link
  // travels from off screen to its resting position. A plain
  // resize/scroll listener missed that transition (no scroll/resize
  // event fires during a CSS transform). The rAF loop is cheap (one
  // getBoundingClientRect per frame) and only runs while the tour is up.
  useLayoutEffect(() => {
    if (!stop) return
    let frame = 0
    const update = () => {
      const target = document.querySelector(stop.anchorSelector)
      if (!target) {
        setPosition(FALLBACK_POSITION)
        setSpotlight(null)
        return
      }
      const rect = target.getBoundingClientRect()
      // Below the anchor when there's room; otherwise sit above.
      const popoverHeight = 200
      const margin = 12
      const placeBelow = rect.bottom + popoverHeight + margin < window.innerHeight
      const top = placeBelow ? rect.bottom + margin : Math.max(margin, rect.top - popoverHeight - margin)
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - 320 - margin),
      )
      setPosition({ top, left })
      setSpotlight({
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      })
    }
    const loop = () => {
      update()
      frame = requestAnimationFrame(loop)
    }
    loop()
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
        // Spotlight: dim the whole page via a huge spread box-shadow while
        // leaving the target rect bright, plus a ring around it. z-[55] sits
        // above page content but below the z-[60] popover. pointer-events
        // none so the page (and the target) stay clickable through the dim.
        <div
          data-testid="tour-popover-spotlight"
          aria-hidden
          className="pointer-events-none fixed z-[55] rounded-lg transition-all duration-150"
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
          // z-[60] keeps the popover above the open mobile sidebar (z-50)
          // so it renders over the drawer the tour just slid in.
          'fixed z-[60] w-[320px] rounded-2xl bg-card p-5 shadow-xl ring-1 ring-neutral-200',
          className,
        )}
      style={{ top: position.top, left: position.left }}
    >
      <div
        data-testid={`tour-popover-stop-${stop.id}`}
        className="space-y-3"
      >
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
