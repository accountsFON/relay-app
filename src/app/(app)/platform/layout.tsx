import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getOrgContext } from '@/server/middleware/auth'

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/sign-in')
  if (!ctx.platformOwner) redirect('/dashboard')
  return <>{children}</>
}
