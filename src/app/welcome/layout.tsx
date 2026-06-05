import type { ReactNode } from 'react'
import { AppChrome } from '@/components/app-chrome'

/**
 * /welcome renders inside the same sidebar shell (and TourProvider) as
 * the rest of the app via the shared AppChrome. It deliberately omits
 * `gateFirstTimers`: the first-timer redirect targets /welcome, so
 * gating it here would create a redirect loop. /welcome lives outside
 * the (app) route group on purpose (see AppChrome comments).
 */
export default async function WelcomeLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>
}
