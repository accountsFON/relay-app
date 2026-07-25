// Sentry initialization for the Node.js server runtime (server components,
// route handlers, server actions). Loaded from src/instrumentation.ts.
//
// Inert by default: with no DSN set, Sentry.init is disabled and does nothing,
// so this is safe to ship before the Sentry project exists. Set SENTRY_DSN
// (or NEXT_PUBLIC_SENTRY_DSN) in the environment to turn capture on.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Errors are always captured. Sample 10% of transactions for performance.
  tracesSampleRate: 0.1,
  // Don't attach request bodies / cookies / user IP by default.
  sendDefaultPii: false,
})
