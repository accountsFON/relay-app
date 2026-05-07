import { auth, currentUser } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import type { OrgContext, UserRole } from '@/lib/types'

/**
 * Resolves the current Clerk session to a full OrgContext.
 * Returns null if unauthenticated or user has no DB record yet.
 *
 * Single-org mode: org context comes from the user's DB record,
 * not from a Clerk org session. No orgId dependency.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const { userId } = await auth()
  if (!userId) return null

  const dbUser = await findUserByClerkId(userId)
  if (!dbUser || !dbUser.organization) return null

  const roleDefaults: Partial<
    Record<UserRole, Partial<Record<string, boolean>>>
  > = {}
  for (const rd of dbUser.organization.roleDefaults) {
    const bucket = (roleDefaults[rd.role] ??= {})
    bucket[rd.permissionKey] = rd.allow
  }

  return {
    userId,
    orgId: dbUser.organization.clerkOrgId,
    role: dbUser.role,
    plan: dbUser.organization.plan,
    organizationDbId: dbUser.organization.id,
    userDbId: dbUser.id,
    linkedClientId: dbUser.linkedClientId,
    permissionOverrides:
      (dbUser.permissionOverrides as Record<string, boolean> | null) ?? null,
    roleDefaults,
  }
}

/**
 * Like getOrgContext but throws if not authenticated.
 * Use in Server Actions and API routes that require auth.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext()
  if (!ctx) throw new Error('Unauthorized')
  return ctx
}

/**
 * Returns the current Clerk user's basic info.
 * Used during onboarding before the DB user record is created.
 */
export async function getClerkUser() {
  return currentUser()
}
