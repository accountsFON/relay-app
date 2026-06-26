import type { OrgContext, UserRole } from '@/lib/types'

/** Cookie holding the target User.id while an admin is viewing-as. */
export const VIEW_AS_COOKIE = 'relay_view_as_user'

/** Auto-expiry for a view-as session (60 minutes). */
export const VIEW_AS_MAX_AGE_SECONDS = 60 * 60

/** Only admins / platform owners can start impersonation, and never while already impersonating. */
export function canInitiateImpersonation(ctx: OrgContext): boolean {
  if (ctx.impersonation) return false
  return ctx.platformOwner || ctx.role === 'admin'
}

/** Already-loaded shape of a candidate target. Pure check, no DB. */
export type ImpersonationTarget = {
  userId: string
  role: UserRole
  deactivatedAt: Date | null
  platformOwner: boolean
  organizationDbId: string
}

/**
 * Eligibility, re-checked on every request in getOrgContext AND in the
 * start action so a forged cookie can never bypass the UI gate.
 */
export function isEligibleImpersonationTarget(
  realCtx: OrgContext,
  target: ImpersonationTarget,
): boolean {
  if (!canInitiateImpersonation(realCtx)) return false
  if (target.userId === realCtx.userDbId) return false
  if (target.deactivatedAt) return false
  if (target.platformOwner) return false
  if (target.role === 'admin') return false
  if (!realCtx.platformOwner && target.organizationDbId !== realCtx.organizationDbId) {
    return false
  }
  return true
}
