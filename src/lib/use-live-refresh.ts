'use client'

import { startTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type UseLiveRefreshOptions = {
  /** Poll cadence in ms. Default 8s — brisk enough to feel live, gentle on the server. */
  intervalMs?: number
  /** Turn the whole thing off (e.g. on a terminal/locked surface). Default on. */
  enabled?: boolean
}

/**
 * Keeps a server-component-driven surface live for collaborators without a
 * manual reload. Two triggers, both firing `router.refresh()`:
 *
 *  1. **Poll** — a `setInterval` that refreshes every `intervalMs`, but ONLY
 *     while the tab is visible (a backgrounded tab does nothing).
 *  2. **Focus / visibility** — an immediate refresh when the tab regains focus
 *     or becomes visible again, so returning to the tab shows the latest at
 *     once rather than waiting for the next poll tick.
 *
 * `router.refresh()` re-runs the server components and streams fresh props in;
 * client component state is PRESERVED across it, so a reviewer's in-progress
 * draft (open caption editor, unsaved note) is never clobbered — only the
 * server-rendered baseline (threads, comments, images, others' edits) updates.
 * The refresh runs inside `startTransition` so it never blocks input.
 */
export function useLiveRefresh({
  intervalMs = 8000,
  enabled = true,
}: UseLiveRefreshOptions = {}) {
  const router = useRouter()

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    const refresh = () => startTransition(() => router.refresh())

    let timer: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') refresh()
      }, intervalMs)
    }
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh() // catch up the moment the tab is looked at again
        startPolling()
      } else {
        stopPolling() // don't poll a tab nobody is looking at
      }
    }
    const onFocus = () => refresh()

    if (document.visibilityState === 'visible') startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onFocus)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onFocus)
    }
  }, [router, intervalMs, enabled])
}
