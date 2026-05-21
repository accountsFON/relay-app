'use client'

import { useEffect } from 'react'

const HIGHLIGHT_CLASS = 'bg-cream-warm'
const HIGHLIGHT_MS = 1500

/**
 * Drop in on any page that should respect `#comment-${eventId}` deep links
 * from the notification bell. On mount and on hashchange, finds the matching
 * `[data-event-id]` element, scrolls it into view, and briefly highlights it.
 *
 * Cleanup: the highlight timer is cleared on unmount so React doesn't touch
 * detached DOM nodes if the user navigates away mid-highlight.
 */
export function EventAnchor() {
  useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | null = null

    const handle = () => {
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash.startsWith('comment-')) return
      const eventId = hash.slice('comment-'.length)
      const el = document.querySelector(
        `[data-event-id="${eventId}"]`,
      ) as HTMLElement | null
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add(HIGHLIGHT_CLASS)
      if (highlightTimer) clearTimeout(highlightTimer)
      highlightTimer = setTimeout(() => {
        el.classList.remove(HIGHLIGHT_CLASS)
        highlightTimer = null
      }, HIGHLIGHT_MS)
    }

    handle()
    window.addEventListener('hashchange', handle)
    return () => {
      window.removeEventListener('hashchange', handle)
      if (highlightTimer) clearTimeout(highlightTimer)
    }
  }, [])

  return null
}
