import { describe, it, expect } from 'vitest'
import {
  PUBLIC_ROUTE_PATTERNS,
  REVIEW_ROUTE_PATTERNS,
} from '@/lib/route-matchers'

// We cannot import src/middleware.ts directly (it pulls @clerk/nextjs/server,
// a server-only package that cannot run in jsdom). Instead we import the SAME
// pattern arrays the middleware feeds into createRouteMatcher, and compile them
// with a faithful matcher that mirrors path-to-regexp's handling of the only
// construct we use, the `(.*)` wildcard. Because the arrays are the real source
// of truth, a regression in the patterns fails this test.

function patternToRegExp(pattern: string): RegExp {
  // Split on the literal `(.*)` token, regex-escape the literal segments, and
  // rejoin with a `.*` wildcard. Allow an optional trailing slash, matching
  // Clerk/path-to-regexp behavior.
  const escaped = pattern
    .split('(.*)')
    .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}/?$`)
}

function matchesAny(patterns: readonly string[], pathname: string): boolean {
  return patterns.some((p) => patternToRegExp(p).test(pathname))
}

const isPublicRoute = (p: string) => matchesAny(PUBLIC_ROUTE_PATTERNS, p)
const isReviewRoute = (p: string) => matchesAny(REVIEW_ROUTE_PATTERNS, p)

const REVIEW_TOKEN = 'p686D1RoqMJDGYiUA9tP4GM2tjKT4cmc_FJc3XdWqFg.cmpilk2tj000004l5dkmz4zce.1784814923391'

describe('public route matching', () => {
  it('treats /sign-in as public', () => {
    expect(isPublicRoute('/sign-in')).toBe(true)
  })

  it('treats /sign-in/sso-callback as public', () => {
    expect(isPublicRoute('/sign-in/sso-callback')).toBe(true)
  })

  it('treats /sign-up as public', () => {
    expect(isPublicRoute('/sign-up')).toBe(true)
  })

  it('treats /approve/abc123 as public', () => {
    expect(isPublicRoute('/approve/abc123token')).toBe(true)
  })

  it('treats /api/health as public', () => {
    expect(isPublicRoute('/api/health')).toBe(true)
  })

  it('treats /dashboard as protected', () => {
    expect(isPublicRoute('/dashboard')).toBe(false)
  })

  it('treats /clients/123 as protected', () => {
    expect(isPublicRoute('/clients/123')).toBe(false)
  })

  it('treats /api/clients/x as protected', () => {
    expect(isPublicRoute('/api/clients/x')).toBe(false)
  })
})

describe('magic-link reviewer API routes are public (Clerk must not protect them)', () => {
  // Regression guard for the draft-save 404 bug: a magic-link reviewer has no
  // Clerk session, so /api/review/** MUST be public or auth.protect() returns
  // 404 and no ReviewSession is ever created, breaking Submit downstream.
  it('treats the draft save route as public', () => {
    expect(isPublicRoute(`/api/review/${REVIEW_TOKEN}/draft`)).toBe(true)
  })

  it('treats the comment-image upload route as public', () => {
    expect(
      isPublicRoute(`/api/review/${REVIEW_TOKEN}/comment-image/upload`),
    ).toBe(true)
  })
})

describe('review page route matching', () => {
  it('treats /review/<token> as a review route (handled by the magic-link guard, not Clerk)', () => {
    expect(isReviewRoute(`/review/${REVIEW_TOKEN}`)).toBe(true)
  })

  it('does not treat the /api/review API route as a review PAGE route', () => {
    // /api/review/** is public (above) but is NOT a /review page, so it must
    // not be sent through guardReviewRoute (which slices the '/review/' prefix).
    expect(isReviewRoute(`/api/review/${REVIEW_TOKEN}/draft`)).toBe(false)
  })

  it('does not treat /dashboard as a review route', () => {
    expect(isReviewRoute('/dashboard')).toBe(false)
  })
})
