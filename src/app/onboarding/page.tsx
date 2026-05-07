import Image from 'next/image'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { completeOnboarding } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default async function OnboardingPage() {
  const { userId } = await auth()
  if (userId) {
    const existing = await findUserByClerkId(userId)
    if (existing) redirect('/dashboard')
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <Image
        src="/brand/logo-no-padding-dark-text.svg"
        alt="Relay"
        width={120}
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
            Tell us your name to finish setting up.
          </p>
        </div>

        <form action={completeOnboarding} className="space-y-5">
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

          <Button type="submit" size="lg" className="w-full">
            Get started
          </Button>
        </form>
      </div>
    </div>
  )
}
