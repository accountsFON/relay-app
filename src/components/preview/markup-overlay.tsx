'use client'

import { useRef, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Absolute-positioned overlay placed on top of an image. Clicking the overlay
 * (anywhere not on an existing pin) drops a new pin: click coordinates are
 * converted to percentages of the overlay's rendered dimensions (0..100) and
 * forwarded via `onCreatePin`. Existing pins render as numbered dots; clicking
 * one calls `onPinClick` instead of dropping a new pin.
 *
 * Pin coords are stored as percentages so they survive responsive image
 * resizing (see design doc § Pin shapes).
 *
 * Layer 2 / Task 2.3.
 */
export type OverlayPin = {
  id: string
  x: number // 0..100 percent
  y: number // 0..100 percent
  status: 'open' | 'resolved'
}

export type MarkupOverlayProps = {
  existingPins: ReadonlyArray<OverlayPin>
  onPinClick: (id: string) => void
  onCreatePin: (x: number, y: number) => void
  disabled?: boolean
  className?: string
}

export function MarkupOverlay({
  existingPins,
  onPinClick,
  onCreatePin,
  disabled = false,
  className,
}: MarkupOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (disabled) return
    const el = overlayRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const xPx = event.clientX - rect.left
    const yPx = event.clientY - rect.top

    const x = clamp((xPx / rect.width) * 100, 0, 100)
    const y = clamp((yPx / rect.height) * 100, 0, 100)

    onCreatePin(x, y)
  }

  return (
    <div
      ref={overlayRef}
      data-testid="markup-overlay"
      data-disabled={disabled ? '1' : '0'}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Click image to leave feedback"
      aria-disabled={disabled ? true : undefined}
      onClick={handleClick}
      className={cn(
        'absolute inset-0',
        disabled ? 'cursor-default' : 'cursor-crosshair',
        className,
      )}
    >
      {existingPins.map((pin, idx) => {
        const isResolved = pin.status === 'resolved'
        return (
          <button
            key={pin.id}
            type="button"
            data-testid="markup-overlay-pin"
            data-thread-id={pin.id}
            data-status={pin.status}
            aria-label={`Open feedback pin ${idx + 1}`}
            onClick={(event) => {
              event.stopPropagation()
              onPinClick(pin.id)
            }}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            className={cn(
              'absolute -translate-x-1/2 -translate-y-1/2 rounded-full text-[11px] font-semibold leading-none shadow-md transition-transform',
              'flex size-6 items-center justify-center',
              isResolved
                ? 'bg-[#dbdbdb] text-[#8e8e8e] opacity-70 hover:scale-105'
                : 'bg-amber-400 text-[#262626] hover:scale-110',
            )}
          >
            {idx + 1}
          </button>
        )
      })}
    </div>
  )
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min
  if (n > max) return max
  return n
}
