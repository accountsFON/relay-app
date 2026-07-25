// Next.js instrumentation hook. Loads the right Sentry config per runtime and
// wires server-side request errors into Sentry.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// Captures errors thrown during React Server Component rendering + route
// handlers so they reach Sentry with request context.
export const onRequestError = Sentry.captureRequestError
