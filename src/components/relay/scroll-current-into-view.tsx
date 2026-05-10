'use client'

import { useEffect } from 'react'

/**
 * Tiny client component that scrolls the active step in the relay-track
 * stepper into view on mount. Used by the batch detail page so that when
 * a user lands on a batch already past the mid relay, the current step
 * is centered, not hidden behind the right-edge truncation.
 *
 * Lives next to the server component RelayTrack which doesn't take a ref;
 * this hooks the data-relay-track + data-current attributes after hydration.
 */
export function ScrollCurrentIntoView() {
  useEffect(() => {
    const track = document.querySelector('[data-relay-track]')
    if (!(track instanceof HTMLElement)) return
    const current = track.querySelector('[data-current]')
    if (!(current instanceof HTMLElement)) return
    // Only scroll if the active item is actually offscreen.
    const trackRect = track.getBoundingClientRect()
    const itemRect = current.getBoundingClientRect()
    const offRight = itemRect.right > trackRect.right - 24
    const offLeft = itemRect.left < trackRect.left + 24
    if (offRight || offLeft) {
      current.scrollIntoView({ behavior: 'instant', inline: 'center', block: 'nearest' })
    }
  }, [])
  return null
}
