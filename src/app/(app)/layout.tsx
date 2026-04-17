import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findUserByClerkId } from '@/server/repositories/users'
import { Sidebar } from '@/components/sidebar'

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
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="max-w-md text-center p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Connection Error</h1>
          <p className="text-sm text-slate-500 mb-4">
            Could not connect to the database. This usually means the DATABASE_URL
            environment variable is missing or the database is waking up from sleep.
          </p>
          <p className="text-xs text-slate-400 font-mono">{message}</p>
          <a
            href="/dashboard"
            className="mt-4 inline-block px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-800"
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
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
