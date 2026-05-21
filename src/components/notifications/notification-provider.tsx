'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  error: 'offline' | null
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

  const fetchSummary = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    try {
      const res = await fetch('/api/notifications/summary')
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
    const id = setInterval(() => {
      void fetchSummary()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [fetchSummary])

  // Visibility change handler: immediate fetch on tab return
  useEffect(() => {
    const onVisibility = () => {
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

  return (
    <Ctx.Provider
      value={{
        ...state,
        markRead,
        refresh: fetchSummary,
        openDropdown,
        closeDropdown,
        toggleDropdown,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>')
  return ctx
}
