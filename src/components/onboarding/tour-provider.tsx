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
import { usePathname } from 'next/navigation'
import { TourPopover, type TourStop } from '@/components/onboarding/tour-popover'

type TourContextValue = {
  /** Whether the tour is currently rendered. */
  active: boolean
  /** Currently rendered stop index (0..stops.length-1). */
  currentIndex: number
  /** Programmatically start the tour from step 0. */
  start: () => void
  /** Programmatically dismiss the tour (persists permanently). */
  dismiss: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

/**
 * Default 3 stop tour for AM + designer + admin personas. The selectors
 * map to `data-tour-anchor` attributes on the sidebar nav items in
 * AppShell. If any anchor goes missing, the popover falls back to a
 * fixed bottom right placement so the copy still ships.
 *
 * Do not reorder or rename stop ids without updating the Playwright
 * spec; it asserts the order by id.
 */
export const DEFAULT_TOUR_STOPS: TourStop[] = [
  {
    id: 'my-relay',
    anchorSelector: '[data-tour-anchor="my-relay"]',
    title: 'My Relay',
    body: 'Your home base. In progress batches, recent activity, deep links to everything.',
  },
  {
    id: 'clients',
    anchorSelector: '[data-tour-anchor="clients"]',
    title: 'Clients',
    body: 'Every client lives here. The AM owns the page, the designer reads it.',
  },
  {
    id: 'inbox',
    anchorSelector: '[data-tour-anchor="inbox"]',
    title: 'Notifications',
    body: 'We will ping you here when a batch needs you, or when a client finishes a review.',
  },
]

export type TourProviderProps = {
  children: React.ReactNode
  /**
   * Whether this user has already dismissed the tour. When false AND
   * the user is on an autofire path (currently /dashboard), the tour
   * auto fires once. Always overridable by the explicit start() trigger
   * from /welcome.
   */
  tourSeen: boolean
  /**
   * Override the default stops. Mostly for tests; in app render uses
   * DEFAULT_TOUR_STOPS.
   */
  stops?: TourStop[]
  /**
   * Optional mark-seen network override. Tests inject a stub so the
   * provider does not need a real fetch implementation.
   */
  onMarkSeen?: () => Promise<void> | void
  /**
   * Paths that auto fire the tour for unseen users. Default: only
   * `/dashboard` so the tour does not surprise users mid task on
   * other routes (settings, client detail, review screens).
   */
  autoFirePaths?: string[]
}

const DEFAULT_AUTOFIRE_PATHS = ['/dashboard']

/**
 * Shell wide guided tour controller.
 *
 * Mounted near the top of AppShell so the popover anchors to sidebar
 * nav items via `data-tour-anchor` selectors. Holds active step state,
 * persists the dismissal exactly once, and exposes a context so the
 * /welcome launch pad can imperatively trigger the tour via
 * useTourController().
 *
 * Auto fire rules:
 *   - Only when `tourSeen` is false.
 *   - Only on a path listed in `autoFirePaths` (default: /dashboard).
 *   - Runs once per provider lifetime; navigating away and back does
 *     not re fire because the local `hasAutoFired` flag stays set.
 *
 * Persistence: dismissal POSTs to /api/onboarding/tour-seen exactly
 * once per user session (the provider tracks a `persisted` flag so a
 * second dismissal does not double POST). Same fire and forget pattern
 * as ReviewTutorialModal; a flaky network just means the tour might
 * fire one extra time on next sign in.
 *
 * Phase 4 item 25.
 */
export function TourProvider({
  children,
  tourSeen,
  stops = DEFAULT_TOUR_STOPS,
  onMarkSeen,
  autoFirePaths = DEFAULT_AUTOFIRE_PATHS,
}: TourProviderProps) {
  const pathname = usePathname()
  // Single state object so all tour related transitions happen in one
  // atomic update. `seededFor` tracks which tourSeen prop value the
  // current state was derived from; comparing against the live prop
  // lets us detect /settings reset (prop flip) and reseed without an
  // effect. `autoFired` blocks re-firing after the first showing for
  // this provider instance.
  type TourState = {
    active: boolean
    currentIndex: number
    autoFired: boolean
    persisted: boolean
    seededFor: boolean
  }
  const initialAutoFire =
    !tourSeen && autoFirePaths.some((p) => pathname.startsWith(p))
  const [state, setState] = useState<TourState>({
    active: initialAutoFire,
    currentIndex: 0,
    autoFired: initialAutoFire || tourSeen,
    persisted: tourSeen,
    seededFor: tourSeen,
  })

  // /settings reset path: tourSeen flips from true -> false. Reseed
  // state inline so the path-change effect below can trigger the next
  // auto fire on the next /dashboard navigation. Pure derivation from
  // a prop change, no setState-in-effect dance.
  let workingState = state
  if (state.seededFor !== tourSeen) {
    workingState = {
      active: false,
      currentIndex: 0,
      autoFired: tourSeen,
      persisted: tourSeen,
      seededFor: tourSeen,
    }
    setState(workingState)
  }
  const { active, currentIndex, autoFired, persisted } = workingState

  // Path-change auto fire: covers the user who lands on /welcome
  // (provider mounts with auto fire off), then navigates to /dashboard.
  // The autoFired flag ensures this runs at most once per provider
  // lifetime. Pathname is an external system the provider syncs
  // against, which is the documented intent for an effect that calls
  // setState in response to route changes.
  useEffect(() => {
    if (autoFired) return
    if (persisted) return
    if (!autoFirePaths.some((p) => pathname.startsWith(p))) return
    // Pathname is an external system (the router) the provider is
    // synchronizing against. The autoFired flag guarantees this runs
    // at most once per provider instance, so the cascading render risk
    // the lint rule guards against does not apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({
      ...prev,
      active: true,
      currentIndex: 0,
      autoFired: true,
    }))
  }, [pathname, autoFirePaths, autoFired, persisted])

  // Track persistence in a ref so the callbacks read the live value
  // (avoids a useCallback dependency cycle where persistSeen would
  // capture a stale persisted snapshot).
  const persistedRef = useRef(persisted)
  useEffect(() => {
    persistedRef.current = persisted
  }, [persisted])

  const persistSeen = useCallback(async () => {
    if (persistedRef.current) return
    persistedRef.current = true
    setState((prev) => ({ ...prev, persisted: true }))
    if (onMarkSeen) {
      try {
        await onMarkSeen()
      } catch (err) {
        console.error('[tour-provider] onMarkSeen threw', err)
      }
      return
    }
    try {
      await fetch('/api/onboarding/tour-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch (err) {
      // Optimistic dismiss: a failed POST means the tour may re-fire on
      // the next sign in. Acceptable per the design.
      console.error('[tour-provider] mark-seen POST threw', err)
    }
  }, [onMarkSeen])

  const start = useCallback(() => {
    setState((prev) => ({
      ...prev,
      active: true,
      currentIndex: 0,
      autoFired: true,
    }))
  }, [])

  const dismiss = useCallback(() => {
    setState((prev) => ({ ...prev, active: false }))
    void persistSeen()
  }, [persistSeen])

  const handleNext = useCallback(() => {
    setState((prev) => {
      const next = prev.currentIndex + 1
      if (next >= stops.length) {
        // Last stop: finishing IS dismissing.
        void persistSeen()
        return { ...prev, active: false }
      }
      return { ...prev, currentIndex: next }
    })
  }, [stops.length, persistSeen])

  const value = useMemo<TourContextValue>(
    () => ({ active, currentIndex, start, dismiss }),
    [active, currentIndex, start, dismiss],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
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
 * Read the tour controller from any descendant component. Safe outside
 * a TourProvider; returns a no-op stub instead of throwing so non
 * authenticated screens (sign in, error pages) do not crash if they
 * accidentally render a consumer.
 */
export function useTourController(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) {
    return {
      active: false,
      currentIndex: 0,
      start: () => {},
      dismiss: () => {},
    }
  }
  return ctx
}
