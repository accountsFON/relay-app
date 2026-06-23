/**
 * Route patterns shared between `src/middleware.ts` and the middleware test,
 * so the test guards the REAL source of truth rather than a private copy.
 * Consumed by Clerk's `createRouteMatcher` (path-to-regexp semantics) in the
 * middleware.
 *
 * Routes under `/api/review/**` are magic-link reviewer endpoints. The
 * reviewer has NO Clerk session; each handler self-authenticates via the
 * signed `magic-link-session` cookie + tokenHash binding. They MUST therefore
 * be public from Clerk's perspective, otherwise `auth.protect()` returns 404
 * to the session-less reviewer and every draft save / image upload fails.
 */
export const PUBLIC_ROUTE_PATTERNS = [
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/approve/(.*)',
  '/api/health',
  '/api/review/(.*)',
] as const

/** Magic-link reviewer pages, handled by the dedicated guard in middleware. */
export const REVIEW_ROUTE_PATTERNS = ['/review/(.*)'] as const
