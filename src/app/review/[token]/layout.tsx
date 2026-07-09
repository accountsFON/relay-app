import type { ReactNode } from 'react'
import Image from 'next/image'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { normalizeBrandColor, normalizeBrandLogoUrl } from '@/lib/org-branding'

/**
 * Magic-link review layout. Locked chrome: a minimal header only, no
 * Relay AppShell sidebar. Sits OUTSIDE the (app) route group so the
 * Clerk-gated AppLayout never wraps it; the only auth check that runs
 * is the magic-link middleware on /review/[token]/**.
 *
 * The header shows "Review by {clientName}" so the reviewer knows
 * whose work they are looking at. We pull the client name through the
 * batch on the validated magicLinkId that middleware attached as a
 * request header, single DB hit, no token verification cost.
 *
 * Note: this file does NOT render <html>/<body>. The root layout at
 * src/app/layout.tsx already does that and wraps the tree in
 * ClerkProvider. ClerkProvider being above us is fine, it only
 * provides React context; it does not gate the route. The actual
 * Clerk-session-required behavior lives in (app)/layout.tsx, which
 * this route deliberately does not pass through.
 */
export default async function ReviewLayout({ children }: { children: ReactNode }) {
  const hdrs = await headers()
  const magicLinkId = hdrs.get('x-magic-link-id')
  // Middleware always attaches this on a validated /review/* request.
  // Absence here means we were rendered without the guard, which should
  // never happen; fall through to 404 rather than render unbranded chrome.
  if (!magicLinkId) {
    notFound()
  }

  const link = await db.magicLink.findUnique({
    where: { id: magicLinkId },
    select: {
      batch: {
        select: {
          client: {
            select: {
              name: true,
              // White-label agency branding (P2 #21); null → the Relay look.
              organization: {
                select: { name: true, brandLogoUrl: true, brandColor: true },
              },
            },
          },
        },
      },
    },
  })
  const clientName = link?.batch.client.name ?? 'Client'
  const branding = link?.batch.client.organization
  // Re-normalize on read (defense in depth) — never trust a stored value before
  // rendering it into the review page style / img src.
  const brandLogoUrl = normalizeBrandLogoUrl(branding?.brandLogoUrl)
  const brandColor = normalizeBrandColor(branding?.brandColor)
  const brandName = branding?.name ?? 'Relay'

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-foreground">
      <header style={brandColor ? { borderTop: `4px solid ${brandColor}` } : undefined}>
        <div className="mx-auto flex w-full max-w-[880px] items-center justify-between px-4 py-4 sm:px-6 md:py-6">
          {brandLogoUrl ? (
            // Agency-supplied external URL (admin-set, normalized to http(s));
            // a plain img avoids next/image remote-domain config.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogoUrl} alt={brandName} className="h-7 w-auto" />
          ) : (
            <Image
              src="/brand/wordmark-dark.svg"
              alt="Relay"
              width={96}
              height={32}
              className="h-7 w-auto"
              priority
            />
          )}
          <div className="flex flex-col items-end">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              Review by
            </span>
            <span className="text-sm font-medium text-neutral-900">
              {clientName}
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
