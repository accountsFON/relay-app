'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompletionNotification =
  | {
      kind: 'single'
      id: string
      clientName: string
      targetMonth: string // 'YYYY-MM'
      href: string // /clients/[id]/batches/[batchId]
      createdAt: number
    }
  | {
      kind: 'aggregated'
      id: string
      count: number
      href: string // /clients
      createdAt: number
    }

export type PushInput = {
  clientName: string
  targetMonth: string
  clientId: string
  batchId: string
}

type CompletionContextValue = {
  notifications: CompletionNotification[]
  push: (input: PushInput) => void
  dismiss: (id: string) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CompletionContext = createContext<CompletionContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CompletionNotificationsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [notifications, setNotifications] = useState<CompletionNotification[]>([])

  const push = useCallback((input: PushInput) => {
    setNotifications((prev) => {
      if (prev.length === 0) {
        // First notification: show as single.
        const entry: CompletionNotification = {
          kind: 'single',
          id: crypto.randomUUID(),
          clientName: input.clientName,
          targetMonth: input.targetMonth,
          href: `/clients/${input.clientId}/batches/${input.batchId}`,
          createdAt: Date.now(),
        }
        return [entry]
      }

      // One or more already present: collapse everything into an aggregated entry.
      const existingCount = prev.reduce(
        (sum, n) => sum + (n.kind === 'aggregated' ? n.count : 1),
        0,
      )
      const aggregated: CompletionNotification = {
        kind: 'aggregated',
        id: crypto.randomUUID(),
        count: existingCount + 1,
        href: '/clients',
        createdAt: Date.now(),
      }
      return [aggregated]
    })
  }, [])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return (
    <CompletionContext.Provider value={{ notifications, push, dismiss }}>
      {children}
    </CompletionContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCompletionNotifications(): CompletionContextValue {
  const ctx = useContext(CompletionContext)
  if (!ctx) {
    throw new Error(
      'useCompletionNotifications must be used inside CompletionNotificationsProvider',
    )
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSingleMessage(clientName: string, targetMonth: string): string {
  const [y, m] = targetMonth.split('-')
  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-US', {
    month: 'long',
  })
  return `${clientName} Posts for ${monthName}, ${y} is ready to view`
}

// ---------------------------------------------------------------------------
// NotificationCard (single row, owns its own timer)
// ---------------------------------------------------------------------------

function NotificationCard({
  notification,
  dismiss,
}: {
  notification: CompletionNotification
  dismiss: (id: string) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const DURATION = 8000

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      dismiss(notification.id)
    }, DURATION)
  }, [dismiss, notification.id])

  // Start the timer when the card mounts (or id changes).
  useEffect(() => {
    startTimer()
    return clearTimer
  }, [startTimer])

  const pauseTimer = () => clearTimer()
  const resumeTimer = () => startTimer()

  const message =
    notification.kind === 'single'
      ? formatSingleMessage(notification.clientName, notification.targetMonth)
      : `${notification.count} Clients are ready to view`

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      className="pointer-events-auto rounded-xl border border-border bg-card shadow-lg p-4 flex items-start gap-3"
    >
      <div className="flex-1 min-w-0">
        <Link
          href={notification.href}
          onClick={() => dismiss(notification.id)}
          className="text-[14px] font-medium text-foreground hover:underline"
        >
          {message}
        </Link>
      </div>
      <button
        onClick={() => dismiss(notification.id)}
        aria-label="Dismiss"
        className="rounded-full p-1 text-muted-foreground hover:bg-neutral-200"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Banner (mounts inside the provider, renders all active notifications)
// ---------------------------------------------------------------------------

export function CompletionNotificationsBanner() {
  const { notifications, dismiss } = useCompletionNotifications()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {notifications.map((n) => (
        <NotificationCard key={n.id} notification={n} dismiss={dismiss} />
      ))}
    </div>
  )
}
