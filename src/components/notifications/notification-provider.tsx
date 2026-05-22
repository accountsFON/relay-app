'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { markMentionReadAction } from '@/app/(app)/clients/[id]/activity/actions'
import type {
  NotificationSummaryDTO,
  NotificationItemDTO,
} from '@/app/api/notifications/summary/route'

interface NotificationState {
  count: number
  items: NotificationItemDTO[]
  isOpen: boolean
  error: 'offline' | 'unauthorized' | null
}

interface NotificationContextValue extends NotificationState {
  markRead: (eventId: string) => Promise<void>
  refresh: () => Promise<void>
  openDropdown: () => void
  closeDropdown: () => void
  toggleDropdown: () => void
}

const Ctx = createContext<NotificationContextValue | null>(null)

const POLL_MS = 20_000

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NotificationState>({
    count: 0,
    items: [],
    isOpen: false,
    error: null,
  })
  const stateRef = useRef(state)
  stateRef.current = state
  // Polling interval ref. Cleared and nulled on 401 so a stale session
  // doesn't keep hammering the route every 20s from a backgrounded tab.
  // Only a fresh mount (page reload after re-auth) restarts polling.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSummary = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    // If we're already in the unauthorized terminal state, bail. Guards
    // against a queued tick firing between the 401 response and the
    // clearInterval below.
    if (stateRef.current.error === 'unauthorized') return
    try {
      const res = await fetch('/api/notifications/summary')
      if (res.status === 401) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setState((s) => ({ ...s, error: 'unauthorized' }))
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as NotificationSummaryDTO
      setState((s) => ({ ...s, count: body.count, items: body.items, error: null }))
    } catch {
      setState((s) => ({ ...s, error: 'offline' }))
    }
  }, [])

  // Initial fetch + interval
  useEffect(() => {
    void fetchSummary()
    intervalRef.current = setInterval(() => {
      void fetchSummary()
    }, POLL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchSummary])

  // Visibility change handler: immediate fetch on tab return. Skipped
  // while unauthorized -- a focus event can't fix a dead session, only
  // a real re-auth (page reload) can.
  useEffect(() => {
    const onVisibility = () => {
      if (stateRef.current.error === 'unauthorized') return
      if (document.visibilityState === 'visible') void fetchSummary()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [fetchSummary])

  const markRead = useCallback(async (eventId: string) => {
    const snapshot = stateRef.current
    const target = snapshot.items.find((i) => i.eventId === eventId)
    setState((s) => ({
      ...s,
      items: s.items.filter((i) => i.eventId !== eventId),
      count: Math.max(0, s.count - 1),
    }))
    try {
      if (!target) return
      await markMentionReadAction(target.mentionId)
    } catch {
      // Rollback
      setState((s) => ({ ...s, items: snapshot.items, count: snapshot.count }))
    }
  }, [])

  const openDropdown = useCallback(() => setState((s) => ({ ...s, isOpen: true })), [])
  const closeDropdown = useCallback(() => setState((s) => ({ ...s, isOpen: false })), [])
  const toggleDropdown = useCallback(() => setState((s) => ({ ...s, isOpen: !s.isOpen })), [])

  // Memoize the context value so consumers don't re-render on every 20s poll
  // tick just because the provider rebuilt the object identity.
  const value = useMemo<NotificationContextValue>(
    () => ({
      ...state,
      markRead,
      refresh: fetchSummary,
      openDropdown,
      closeDropdown,
      toggleDropdown,
    }),
    [state, markRead, fetchSummary, openDropdown, closeDropdown, toggleDropdown],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>')
  return ctx
}
