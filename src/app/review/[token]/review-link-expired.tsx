import { Clock } from 'lucide-react'

/**
 * Friendly terminal state for a correctly-signed but expired review link
 * (P2 #23). The middleware flags expiry via the `x-magic-link-expired` header;
 * the page renders this instead of the review feed. No token is echoed, and
 * malformed / bad-signature tokens still 404 upstream — only a link we actually
 * minted reaches here.
 */
export function ReviewLinkExpired() {
  return (
    <div
      data-testid="review-link-expired"
      className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div className="rounded-full bg-neutral-100 p-3">
        <Clock aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">
        This review link has expired
      </h1>
      <p className="text-sm text-muted-foreground">
        For security, review links stay active for a limited time. Reach out to
        your account manager and they&apos;ll send you a fresh one.
      </p>
    </div>
  )
}
