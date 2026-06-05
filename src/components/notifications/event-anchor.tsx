'use client'

import { useEffect } from 'react'

const HIGHLIGHT_CLASS = 'bg-neutral-100'
const HIGHLIGHT_MS = 1500

/**
 * Maps a hash prefix to the DOM attribute that identifies its target.
 *   `#comment-${eventId}` -> the activity thread row   ([data-event-id])
 *   `#post-${postId}`     -> the post card             ([data-post-id])
 */
const ANCHOR_PREFIXES: ReadonlyArray<{ prefix: string; attr: string }> = [
  { prefix: 'comment-', attr: 'data-event-id' },
  { prefix: 'post-', attr: 'data-post-id' },
]

/**
 * Drop in on any page that should respect `#comment-${eventId}` or
 * `#post-${postId}` deep links from the notification bell / inbox. On mount
 * and on hashchange, finds the matching target element, scrolls it into view,
 * and briefly highlights it.
 *
 * Cleanup: the highlight timer is cleared on unmount so React doesn't touch
 * detached DOM nodes if the user navigates away mid-highlight.
 */
export function EventAnchor() {
  useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | null = null

    const handle = () => {
      const hash = window.location.hash.replace(/^#/, '')
      const match = ANCHOR_PREFIXES.find(({ prefix }) => hash.startsWith(prefix))
      if (!match) return
      const id = hash.slice(match.prefix.length)
      // CSS.escape guards against future ID formats that include special
      // selector characters; current CUID2 ids don't need it but the cost
      // is one call.
      const el = document.querySelector(
        `[${match.attr}="${CSS.escape(id)}"]`,
      ) as HTMLElement | null
      if (!el) return
      // Respect the user's motion preference. `'auto'` is an instant jump
      // with no animation; `'smooth'` is the animated scroll.
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      })
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
