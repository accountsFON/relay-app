'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * Error boundary for any page rendered inside the (app) shell.
 *
 * Next.js wraps every server-component segment in an error boundary that
 * looks for an error.tsx file in the segment's directory (or any parent).
 * Without one, the user sees Next's default fallback — a white screen
 * with a stack trace. This component catches that and shows a friendly
 * card with a retry button and a back-to-dashboard escape hatch.
 *
 * Notes:
 * - Must be a client component (Next requirement for error boundaries).
 * - The `reset` prop re-renders the failed segment. If the error is
 *   transient (network blip, race), retry succeeds. If it's deterministic,
 *   the user sees the same error and has the dashboard link as fallback.
 * - The `error.digest` is the server's correlation id (logged on the
 *   server side). Surfacing it lets a user paste it in a bug report and
 *   the team can grep prod logs for the matching entry.
 * - Console logging is here as a safety net so client-side errors land
 *   in the browser console with the digest. Server-side errors land in
 *   Vercel logs via Next's framework hooks.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app-error]', error)
  }, [error])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12">
      <div className="max-w-md rounded-2xl bg-card p-8 text-center">
        <h1
          className="text-2xl font-normal italic text-foreground"
          style={{
            fontFamily: 'var(--font-serif)',
            letterSpacing: '-0.5px',
            lineHeight: 1.15,
          }}
        >
          Something's off.
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          We hit an unexpected error rendering this page. Try again, or head
          back to the dashboard.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground font-mono break-all">
            ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/dashboard">
            <Button variant="outline">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
