import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'

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
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl bg-card p-8 text-center">
          <h1
            className="text-2xl font-normal italic text-foreground"
            style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.5px', lineHeight: 1.15 }}
          >
            Something's off.
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            Could not connect to the database. Usually this means DATABASE_URL is
            missing or the database is waking up.
          </p>
          <p className="mt-3 text-xs text-muted-foreground font-mono break-all">{message}</p>
          <a href="/dashboard" className="mt-6 inline-block">
            <Button>Retry</Button>
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
