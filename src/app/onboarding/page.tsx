import Image from 'next/image'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { completeOnboarding } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ __clerk_ticket?: string }>
}) {
  const params = await searchParams
  const inviteTicket = params.__clerk_ticket ?? ''

  const { userId, orgId: clerkActiveOrgId } = await auth()
  const existing = userId ? await findUserByClerkId(userId) : null

  // Detect invite acceptance: explicit ticket in URL, OR a brand-new user
  // (no DB row yet) who already has a Clerk active org. Clerk consumes
  // the ticket during signup and sets the active org, but drops the URL
  // query param on its post-signup redirect — so for first-time invitees
  // the active-org-but-no-User signal is the only one we have left.
  const isInvite =
    Boolean(inviteTicket) || (!existing && Boolean(clerkActiveOrgId))

  // Existing users with Memberships cannot self-serve a second agency.
  if (existing && !isInvite) redirect('/dashboard')

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
      <div className="w-full max-w-md rounded-2xl bg-card p-8 sm:p-10">
        <div className="mb-8 text-center">
          <h1
            className="text-3xl font-normal italic text-foreground"
            style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px', lineHeight: 1.1 }}
          >
            Welcome to Relay.
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            {isInvite
              ? 'You were invited to join an agency. Tell us your name to finish.'
              : 'Tell us your name and the agency you are starting.'}
          </p>
        </div>

        <form action={completeOnboarding} className="space-y-5">
          <input type="hidden" name="inviteTicket" value={inviteTicket} />
          <div className="space-y-2">
            <Label htmlFor="displayName">Your name</Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              required
              placeholder="e.g. Julio Aleman"
            />
          </div>
          {!isInvite && (
            <div className="space-y-2">
              <Label htmlFor="agencyName">Agency name</Label>
              <Input
                id="agencyName"
                name="agencyName"
                type="text"
                required
                placeholder="e.g. Acme Marketing"
              />
            </div>
          )}
          <Button type="submit" size="lg" className="w-full">
            Get started
          </Button>
        </form>
      </div>
    </div>
  )
}
