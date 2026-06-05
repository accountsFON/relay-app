import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { hashToken, verifyToken } from '@/lib/magic-link'
import { findByTokenHash } from '@/server/repositories/magicLinks'

// Node.js runtime so middleware can use node:crypto (magic-link HMAC) and
// Prisma (revocation lookup). Paired with experimental.nodeMiddleware in
// next.config.ts. Without this, Edge runtime rejects the node:crypto import.
export const runtime = 'nodejs'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/approve/(.*)',
  '/api/health',
])

const isReviewRoute = createRouteMatcher(['/review/(.*)'])

/** Header bridge from middleware → /review/[token] route handler.
 *  Lets the page skip a duplicate verifyToken + DB lookup. */
const MAGIC_LINK_ID_HEADER = 'x-magic-link-id'
const MAGIC_LINK_BATCH_ID_HEADER = 'x-magic-link-batch-id'

const clerk = clerkMiddleware(async (auth, request) => {
  // Sign-up gate: when public signup is disabled, block the bare /sign-up
  // route unless the request carries a Clerk invite ticket. Catches modal,
  // OAuth-initiated, and direct-URL paths uniformly, the page-level gate
  // alone was bypassable. Sub-routes like /sign-up/sso-callback or
  // /sign-up/factor-one pass through; those require an already-started flow,
  // which this gate prevents at the entry point.
  const { pathname } = request.nextUrl
  if (pathname === '/sign-up' || pathname === '/sign-up/') {
    const publicAllowed = process.env.RELAY_ALLOW_PUBLIC_SIGNUP === 'true'
    const hasInvite = request.nextUrl.searchParams.has('__clerk_ticket')
    if (!publicAllowed && !hasInvite) {
      const url = new URL('/sign-in', request.url)
      url.searchParams.set('invite_only', '1')
      return NextResponse.redirect(url)
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }

  return NextResponse.next()
})

/**
 * Magic-link guard for /review/[token]/**. We deliberately collapse all
 * failure modes to a single 404 (token shape / signature / expiry) and a
 * single 410 (revoked / batch archived / link missing) so the surface
 * does not leak whether a token exists. The route handler downstream can
 * trust the headers because it never receives the request unless this
 * guard already validated them.
 */
async function guardReviewRoute(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Strip leading '/review/' and grab the first path segment as the token.
  // Subroutes (`/review/[token]/post/[id]`) all share the same token at index 0.
  const rest = pathname.slice('/review/'.length)
  if (rest.length === 0) {
    return new NextResponse(null, { status: 404 })
  }
  const token = decodeURIComponent(rest.split('/')[0] ?? '')
  if (!token) {
    return new NextResponse(null, { status: 404 })
  }

  const verified = verifyToken(token)
  if (!verified) {
    // Malformed, bad signature, or expired. 404 to avoid leaking which.
    return new NextResponse(null, { status: 404 })
  }

  const tokenHash = hashToken(token)
  const link = await findByTokenHash(tokenHash)
  if (!link || link.revokedAt || link.batch.deletedAt) {
    return new NextResponse(null, { status: 410 })
  }

  // Forward the validated identity to the route handler.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(MAGIC_LINK_ID_HEADER, link.id)
  requestHeaders.set(MAGIC_LINK_BATCH_ID_HEADER, link.batchId)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isReviewRoute(request)) {
    return guardReviewRoute(request)
  }
  return clerk(request, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jte|ttf|woff2?|png|jpg|jpeg|gif|svg|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
