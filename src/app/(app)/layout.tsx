import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  let dbUser
  try {
    dbUser = await findUserByClerkId(userId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DB error'
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="max-w-md text-center p-6">
          <h1 className="text-xl font-bold text-foreground mb-2">Connection Error</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Could not connect to the database. This usually means the DATABASE_URL
            environment variable is missing or the database is waking up from sleep.
          </p>
          <p className="text-xs text-muted-foreground font-mono">{message}</p>
          <a
            href="/dashboard"
            className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90"
          >
            Retry
          </a>
        </div>
      </div>
    )
  }

  if (!dbUser) {
    redirect('/onboarding')
  }

  return (
    <AppShell>
      {children}
    </AppShell>
  )
}
