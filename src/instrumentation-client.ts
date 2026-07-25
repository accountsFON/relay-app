// Sentry initialization for the browser. Runs on the client at app startup.
// Inert with no NEXT_PUBLIC_SENTRY_DSN set.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})

// Lets Sentry track client-side navigations (App Router transitions).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
