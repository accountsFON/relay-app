'use client'

// Root error boundary. Fires when an error escapes the root layout itself
// (so the normal (app)/error.tsx boundary can't render). Reports to Sentry and
// shows a minimal standalone page, since the app shell/styles aren't available
// here. Must render its own <html>/<body>.
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: '2rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 400 }}>
            Something went wrong.
          </h1>
          <p style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
            The error has been reported. Try reloading the page.
          </p>
        </div>
      </body>
    </html>
  )
}
