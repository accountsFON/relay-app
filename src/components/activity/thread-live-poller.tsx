'use client'

/**
 * ThreadLivePoller: makes the activity thread feel live without a manual
 * refresh. Renders nothing. Every POLL_MS it asks a cheap endpoint for the
 * newest visible event id (scoped to the same date range the page uses, via
 * the current URL query) and, when that id differs from what the server last
 * rendered, triggers a soft `router.refresh()` so the thread re-renders with
 * the new messages. Polling only pays the full re-render WHEN something is
 * actually new, never on a quiet tick.
 *
 * Mirrors the notification-provider polling discipline: pauses while the tab
 * is hidden, fetches immediately when the tab regains focus, and stops for
 * good on a 401 so a dead session doesn't hammer the endpoint.
 */
import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const POLL_MS = 5_000

interface ActivityLatestDTO {
  latestId: string | null
}

export function ThreadLivePoller({
  clientId,
  latestEventId,
}: {
  clientId: string
  latestEventId: string | null
}) {
  const router = useRouter()
  // Baseline we compare each poll against. Seeded from the server render and
  // advanced as soon as we trigger a refresh, so a second poll firing before
  // the server prop updates doesn't refresh again.
  const latestRef = useRef(latestEventId)
  const stoppedRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep the baseline in sync when the server re-renders with newer events
  // (e.g. after our own refresh, or another surface's navigation).
  useEffect(() => {
    latestRef.current = latestEventId
  }, [latestEventId])

  const check = useCallback(async () => {
    if (stoppedRef.current) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    try {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const res = await fetch(`/api/clients/${clientId}/activity/latest${search}`)
      if (res.status === 401) {
        stoppedRef.current = true
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return
      }
      if (!res.ok) return
      const body = (await res.json()) as ActivityLatestDTO
      if (body.latestId !== latestRef.current) {
        // Advance the baseline immediately so we don't re-trigger before the
        // server-rendered prop catches up on the next render.
        latestRef.current = body.latestId
        router.refresh()
      }
    } catch {
      // Offline / transient. Leave the baseline alone and retry next tick.
    }
  }, [clientId, router])

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void check()
    }, POLL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [check])

  // Fetch immediately when the tab regains focus, so returning to a stale tab
  // catches up without waiting for the next interval.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [check])

  return null
}
