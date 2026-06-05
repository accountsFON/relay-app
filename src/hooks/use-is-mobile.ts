import { useEffect, useState } from 'react'

/**
 * Tracks whether the viewport is below the Tailwind `md` breakpoint
 * (767px = just under 768px). SSR-safe: returns false during the
 * server render and the first client render, then syncs from
 * matchMedia on mount and subscribes to its `change` event.
 *
 * Used by the onboarding tour to know when the sidebar nav lives in a
 * hidden mobile drawer so it can ask AppShell to open it.
 */
const MOBILE_QUERY = '(max-width: 767px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])

  return isMobile
}
