// Sentry initialization for the Edge runtime (middleware, edge route handlers).
// Loaded from src/instrumentation.ts. Inert with no DSN set (see server config).
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})
