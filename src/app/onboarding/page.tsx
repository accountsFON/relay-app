import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { completeOnboarding } from './actions'

export default async function OnboardingPage() {
  const { userId } = await auth()
  if (userId) {
    const existing = await findUserByClerkId(userId)
    if (existing) redirect('/dashboard')
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Welcome to Relay</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your name to finish setting up your account.
          </p>
        </div>

        <form action={completeOnboarding} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="displayName"
              className="text-sm font-medium text-foreground"
            >
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              required
              placeholder="e.g. Julio Aleman"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </button>
        </form>
      </div>
    </div>
  )
}
