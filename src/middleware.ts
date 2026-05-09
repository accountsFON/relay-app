import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/approve/(.*)',
  '/api/health',
])

export default clerkMiddleware(async (auth, request) => {
  // Sign-up gate: when public signup is disabled, block the bare /sign-up
  // route unless the request carries a Clerk invite ticket. Catches modal,
  // OAuth-initiated, and direct-URL paths uniformly — the page-level gate
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
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jte|ttf|woff2?|png|jpg|jpeg|gif|svg|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
