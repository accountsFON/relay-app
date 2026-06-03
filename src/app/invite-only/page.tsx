import Image from 'next/image'
import { SignOutButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

// Invite-only dead-end. Reached only by a signed-in user with no membership,
// redirected here from /onboarding when self-serve agency creation is off.
// Deliberately OUTSIDE the (app) route group: that layout bounces no-membership
// users back to /onboarding, which would loop. It is intentionally NOT in the
// middleware public-route list either, so Clerk auth-protect applies; only
// authenticated users arrive via the redirect chain, which is the intended set.
export default function InviteOnlyPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <Image
        src="/brand/wordmark-dark.svg"
        alt="Relay"
        width={72}
        height={36}
        priority
        className="h-9 w-auto mb-10"
      />
      <div className="max-w-md text-center">
        <h1
          className="text-2xl font-normal italic mb-3 text-foreground"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px' }}
        >
          Relay is invite-only.
        </h1>
        <p className="text-muted-foreground mb-6">
          You need an invite to join. Ask your agency admin to send you one,
          then open the link in that email to finish setting up.
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    </div>
  )
}
