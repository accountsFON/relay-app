'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { TourPopover } from '@/components/onboarding/tour-popover'
import {
  getTourById,
  selectAutoTour,
} from '@/components/onboarding/tour-registry'
import type { UserRole } from '@/lib/types'
import { useIsMobile } from '@/hooks/use-is-mobile'

type TourContextValue = {
  active: boolean
  activeTourId: string | null
  currentIndex: number
  /** Start (or replay) a specific tour by id. */
  start: (tourId: string) => void
  /** Dismiss the active tour (marks it seen). */
  dismiss: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export type TourProviderProps = {
  children: React.ReactNode
  /** Current user's role; drives which tours auto-fire. */
  role: UserRole
  /** Tour ids already completed/dismissed (from User.seenTours). */
  seenTours: string[]
  /** Test override for the mark-seen network call. */
  onMarkSeen?: (tourId: string) => Promise<void> | void
  /** Reports whether a tour wants the mobile nav drawer open. */
  onTourNavChange?: (open: boolean) => void
}

/**
 * Shell-wide multi-tour controller.
 *
 * Picks an auto-fire tour by route + role + seen-state (see the registry's
 * selectAutoTour) and renders it with TourPopover. Per-tour "seen" state is
 * marked on finish/skip via POST /api/onboarding/tour-seen and tracked
 * locally so a tour never re-fires within a session. Manual start(id) (from
 * the Settings replay panel or the /welcome launch pad) runs any tour
 * regardless of seen-state.
 *
 * No cross-route navigation: each tour is single-page. Mounted at the
 * AppShell root so it persists across route changes.
 */
export function TourProvider({
  children,
  role,
  seenTours,
  onMarkSeen,
  onTourNavChange,
}: TourProviderProps) {
  const pathname = usePathname()
  const isMobile = useIsMobile()

  const [seen, setSeen] = useState<Set<string>>(() => new Set(seenTours))
  const [activeTourId, setActiveTourId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const activeTour = activeTourId ? getTourById(activeTourId) : null
  const stops = useMemo(
    () => (activeTour ? activeTour.stopsForRole(role) : []),
    [activeTour, role],
  )

  // Auto-fire: when nothing is active, sync against the route by picking the
  // first eligible auto tour. Pathname is an external system; the seen-set
  // guard means a finished tour can never re-pick.
  useEffect(() => {
    if (activeTourId) return
    const tour = selectAutoTour(pathname, role, [...seen])
    if (!tour) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTourId(tour.id)
    setCurrentIndex(0)
  }, [pathname, role, seen, activeTourId])

  const persistSeen = useCallback(
    async (tourId: string) => {
      setSeen((prev) => {
        if (prev.has(tourId)) return prev
        const next = new Set(prev)
        next.add(tourId)
        return next
      })
      if (onMarkSeen) {
        try {
          await onMarkSeen(tourId)
        } catch (err) {
          console.error('[tour-provider] onMarkSeen threw', err)
        }
        return
      }
      try {
        await fetch('/api/onboarding/tour-seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tourId }),
        })
      } catch (err) {
        console.error('[tour-provider] mark-seen POST threw', err)
      }
    },
    [onMarkSeen],
  )

  const finish = useCallback(
    (tourId: string) => {
      setActiveTourId(null)
      setCurrentIndex(0)
      void persistSeen(tourId)
    },
    [persistSeen],
  )

  const start = useCallback((tourId: string) => {
    setActiveTourId(tourId)
    setCurrentIndex(0)
  }, [])

  const dismiss = useCallback(() => {
    if (activeTourId) finish(activeTourId)
  }, [activeTourId, finish])

  const handleNext = useCallback(() => {
    if (!activeTour) return
    setCurrentIndex((i) => {
      const next = i + 1
      if (next >= activeTour.stopsForRole(role).length) {
        finish(activeTour.id)
        return 0
      }
      return next
    })
  }, [activeTour, role, finish])

  // Tell AppShell whether the tour needs the mobile nav drawer open.
  useEffect(() => {
    onTourNavChange?.(!!activeTourId && isMobile)
  }, [activeTourId, isMobile, onTourNavChange])

  const value = useMemo<TourContextValue>(
    () => ({
      active: !!activeTourId,
      activeTourId,
      currentIndex,
      start,
      dismiss,
    }),
    [activeTourId, currentIndex, start, dismiss],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {activeTour && (
        <TourPopover
          stops={stops}
          currentIndex={currentIndex}
          onNext={handleNext}
          onSkip={dismiss}
          onClose={dismiss}
        />
      )}
    </TourContext.Provider>
  )
}

/**
 * Read the tour controller from any descendant. Safe outside a provider;
 * returns a no-op stub so non-app screens never crash.
 */
export function useTourController(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    return {
      active: false,
      activeTourId: null,
      currentIndex: 0,
      start: () => {},
      dismiss: () => {},
    }
  }
  return ctx
}
