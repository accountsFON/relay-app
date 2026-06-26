import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import { listMembershipsForUser } from '@/server/repositories/memberships'
import {
  unreadMentionCount,
  visibilityForViewer,
} from '@/server/repositories/activityEvents'
import { getOrgContext } from '@/server/middleware/auth'
import { can } from '@/server/auth/permissions'
import { getClientScopeFilter } from '@/server/auth/scope'
import { AppShell } from '@/components/app-shell'
import { isArchiveViewer } from '@/lib/archive-access'
import { MaintenanceScreen } from '@/components/maintenance-screen'
import { Button } from '@/components/ui/button'

/**
 * Shared application chrome: maintenance gate, auth, org context
 * resolution, nav data, onboarding columns, and the AppShell render.
 *
 * Extracted verbatim from the original (app)/layout.tsx so both the
 * (app) route group AND the standalone /welcome route render inside the
 * same sidebar shell (and therefore the same TourProvider).
 *
 * The ONLY behavioural difference between the two call sites is the
 * first-timer redirect to /welcome: it is gated behind `gateFirstTimers`.
 * The (app) layout passes `gateFirstTimers` so unseen users are bounced
 * to /welcome; the /welcome layout omits it so the page it sends users
 * to cannot re-redirect onto itself (which would loop).
 */
export async function AppChrome({
  children,
  gateFirstTimers = false,
}: {
  children: React.ReactNode
  gateFirstTimers?: boolean
}) {
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
    if (dbUser.deactivatedAt) redirect('/no-access?reason=closed')

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
  const showArchive = isArchiveViewer(ctx)
  const showLibrary = ctx.role !== 'client' // Beta QA index is agency-internal
  const unreadMentions = await unreadMentionCount(
    ctx.userDbId,
    ctx.organizationDbId,
    visibilityForViewer(ctx),
    getClientScopeFilter(ctx),
  ).catch(() => 0)

  // Phase 4 item 25: first time users land on /welcome before they see
  // any other (app) surface. The redirect fires when BOTH onboarding
  // columns are null (so a partial state — skipped launch pad but
  // unfinished tour — does not re trigger the launch pad), and never for
  // client persona users (their onboarding is the magic link review
  // tutorial, item 24, not this surface).
  //
  // /welcome lives OUTSIDE this (app) route group on purpose: it is a
  // standalone route under the root layout, so this redirect can never
  // re-target the page it sends the user to. The earlier in-(app) /welcome
  // self-redirected during the onboarding server-action navigation (the
  // pathname guard could not hold in that render context), which rendered
  // the welcome page blank until a hard reload. Moving it out removes the
  // loop entirely, so no pathname header is needed here.
  const onboarding = await db.user
    .findUnique({
      where: { id: ctx.userDbId },
      select: { onboardingTourSeenAt: true, launchPadDismissedAt: true, seenTours: true },
    })
    .catch(() => null)
  const tourSeen = !!onboarding?.onboardingTourSeenAt
  const launchPadDismissed = !!onboarding?.launchPadDismissedAt
  const isClientPersona = ctx.role === 'client'
  if (gateFirstTimers && !isClientPersona && !tourSeen && !launchPadDismissed) {
    redirect('/welcome')
  }

  const impersonation = ctx.impersonation ?? null
  // Admin/PO only, and never while already impersonating (during which
  // ctx.role is the target's non-admin role and platformOwner is false, so
  // this is already false — kept explicit for clarity).
  const showViewAs = !impersonation && (ctx.role === 'admin' || ctx.platformOwner)

  return (
    <AppShell
      showAdmin={showAdmin}
      showArchive={showArchive}
      platformOwner={ctx.platformOwner}
      showLibrary={showLibrary}
      membershipCount={memberships.length}
      activeAgencyName={activeAgencyName}
      allAgencies={allAgencies}
      userAgencies={userAgencies}
      activeClerkOrgId={ctx.orgId}
      unreadMentions={unreadMentions}
      role={ctx.role}
      seenTours={onboarding?.seenTours ?? []}
      showViewAs={showViewAs}
      impersonation={
        impersonation
          ? { targetUserName: impersonation.targetUserName }
          : null
      }
    >
      {children}
    </AppShell>
  )
}
