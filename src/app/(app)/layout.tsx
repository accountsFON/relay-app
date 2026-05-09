import type { ReactNode } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import { listMembershipsForUser } from '@/server/repositories/memberships'
import { unreadMentionCount } from '@/server/repositories/activityEvents'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import { AppShell } from '@/components/app-shell'
import { MaintenanceScreen } from '@/components/maintenance-screen'
import { Button } from '@/components/ui/button'

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (process.env.RELAY_MAINTENANCE_MODE === 'true') {
    return <MaintenanceScreen />
  }

  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let ctx
  try {
    ctx = await getOrgContext()
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

  if (!ctx) {
    const dbUser = await findUserByClerkId(userId)
    if (!dbUser) redirect('/onboarding')

    // Ghost-org fallback: Clerk session points at an org that has no DB
    // counterpart (created via Clerk dashboard / API outside our flows).
    // Show a more specific message than the generic "no access" page.
    const { orgId: clerkActiveOrgId } = await auth()
    if (clerkActiveOrgId) {
      const ghost = !(await findOrgByClerkId(clerkActiveOrgId))
      if (ghost) redirect('/no-access?reason=ghost-org')
    }
    redirect('/no-access')
  }

  const memberships = await listMembershipsForUser(ctx.userDbId)
  const activeMembership = memberships.find(
    (m) => m.organizationId === ctx.organizationDbId,
  )
  let activeAgencyName = activeMembership?.organization.name ?? ''

  // Platform owners need the full list of orgs to drive their dropdown.
  // Multi-membership regular users get a dropdown of their own Memberships,
  // mapped to the same AgencyOption shape.
  let allAgencies = undefined as
    | { id: string; name: string; clerkOrgId: string }[]
    | undefined
  if (ctx.platformOwner) {
    const orgs = await db.organization.findMany({
      select: { id: true, name: true, clerkOrgId: true },
      orderBy: { name: 'asc' },
    })
    allAgencies = orgs
    if (!activeAgencyName) {
      const active = orgs.find((o) => o.id === ctx.organizationDbId)
      activeAgencyName = active?.name ?? 'Platform'
    }
  }
  if (!activeAgencyName) activeAgencyName = 'Platform'

  const userAgencies =
    !ctx.platformOwner && memberships.length > 1
      ? memberships.map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          clerkOrgId: m.organization.clerkOrgId,
        }))
      : undefined

  const showAdmin = can(ctx, 'admin.portal')
  const unreadMentions = await unreadMentionCount(ctx.userDbId).catch(() => 0)

  return (
    <AppShell
      showAdmin={showAdmin}
      platformOwner={ctx.platformOwner}
      membershipCount={memberships.length}
      activeAgencyName={activeAgencyName}
      allAgencies={allAgencies}
      userAgencies={userAgencies}
      activeClerkOrgId={ctx.orgId}
      unreadMentions={unreadMentions}
    >
      {children}
    </AppShell>
  )
}
