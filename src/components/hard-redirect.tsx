'use client'

import { useEffect } from 'react'
import Image from 'next/image'

/**
 * Full-document navigation to `to` (via window.location), rendered where a
 * server `redirect()` would otherwise deliver the destination through a soft
 * RSC navigation that fails to hydrate, i.e. the page renders but every
 * control is dead until a manual reload.
 *
 * Used by the (app) first-timer gate to reach /welcome. The gate previously
 * called `redirect('/welcome')`; when the (app) route was itself reached via a
 * client navigation (e.g. Clerk's post-sign-in router push), that chained
 * server redirect landed /welcome non-interactive. Returning this component
 * instead lets the (app) route hydrate normally, then hard-navigate, so
 * /welcome always loads as a fresh, interactive document.
 *
 * Uses `replace` so the bounced-through (app) route leaves no history entry.
 */
export function HardRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Image
        src="/brand/wordmark-dark.svg"
        alt="Relay"
        width={72}
        height={36}
        priority
        className="h-9 w-auto opacity-50"
      />
    </div>
  )
}
