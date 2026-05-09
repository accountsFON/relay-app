import { SignOutButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const isGhostOrg = reason === 'ghost-org'

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1
          className="text-2xl font-normal italic mb-3"
          style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px' }}
        >
          {isGhostOrg ? 'Organization not set up.' : 'No access to this agency.'}
        </h1>
        <p className="text-muted-foreground mb-6">
          {isGhostOrg
            ? 'This organization exists in your Clerk account but has not been set up in Relay yet. Contact an admin to finish onboarding it.'
            : 'You are not a member of this agency. If you should have access, ask the agency admin to invite you.'}
        </p>
        <SignOutButton redirectUrl="/sign-in">
          <Button variant="outline">Sign out</Button>
        </SignOutButton>
      </div>
    </div>
  )
}
