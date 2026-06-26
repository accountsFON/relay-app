'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { getOrgContext } from '@/server/middleware/auth'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { findMembership, listImpersonationCandidates } from '@/server/repositories/memberships'
import {
  recordImpersonationStart,
  recordImpersonationStop,
} from '@/server/repositories/impersonationLogs'
import {
  VIEW_AS_COOKIE,
  VIEW_AS_MAX_AGE_SECONDS,
  isEligibleImpersonationTarget,
} from '@/server/auth/impersonation'

/** Eligible view-as targets in the admin's active org, for the dropdown. */
export async function listImpersonationTargets() {
  const ctx = await requireAdminPortal()
  const candidates = await listImpersonationCandidates(ctx.organizationDbId)
  return candidates
    .filter((m) =>
      isEligibleImpersonationTarget(ctx, {
        userId: m.user.id,
        role: m.role,
        deactivatedAt: null, // candidates query already excludes deactivated
        platformOwner: m.user.platformOwner,
        organizationDbId: m.organizationId,
      }),
    )
    .map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role }))
}

/** Begin viewing-as the target. Re-validates eligibility server-side. */
export async function startViewAs(targetUserId: string) {
  const ctx = await requireAdminPortal()
  const targetUser = await db.user.findUnique({ where: { id: targetUserId } })
  if (!targetUser) throw new Error('User not found')

  const orgDbId = ctx.platformOwner ? targetUser.organizationId : ctx.organizationDbId
  const membership = await findMembership(targetUserId, orgDbId)
  if (!membership) throw new Error('User is not a member of this agency')

  const eligible = isEligibleImpersonationTarget(ctx, {
    userId: targetUser.id,
    role: membership.role,
    deactivatedAt: targetUser.deactivatedAt,
    platformOwner: targetUser.platformOwner,
    organizationDbId: membership.organizationId,
  })
  if (!eligible) throw new Error('Cannot view as this user')

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, targetUserId, {
    path: '/',
    maxAge: VIEW_AS_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
  })
  await recordImpersonationStart({
    realActorId: ctx.userDbId,
    targetUserId,
    organizationId: orgDbId,
  })
  redirect('/dashboard')
}

/** Exit view-as. Clears the cookie unconditionally (so it can never trap). */
export async function stopViewAs() {
  const ctx = await getOrgContext()
  if (ctx?.impersonation) {
    await recordImpersonationStop({
      realActorId: ctx.impersonation.realUserId,
      targetUserId: ctx.userDbId,
      organizationId: ctx.organizationDbId,
    })
  }
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  redirect('/dashboard')
}
