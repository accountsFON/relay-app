import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect('/sign-in')
  if (!can(ctx, 'admin.portal')) redirect('/dashboard')

  return <>{children}</>
}
