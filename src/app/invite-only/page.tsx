import Image from 'next/image'
import { SignOutButton } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

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
