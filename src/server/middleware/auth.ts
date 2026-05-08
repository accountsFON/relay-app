import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/db/client'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import { findMembership } from '@/server/repositories/memberships'
import type { OrgContext, UserRole } from '@/lib/types'

/**
 * Resolves the current Clerk session to a full OrgContext.
 *
 * Returns null when:
 *   - No authenticated Clerk user
 *   - No DB user row (onboarding required)
 *   - User has no Membership for the active org AND no platformOwner badge
 *
 * Active org resolution order:
 *   1. Clerk session's active org, if it matches a DB Organization
 *   2. The user's first Membership's organization (oldest by createdAt)
 *   3. If platform owner with no Memberships, returns a placeholder ctx
 *      with empty orgId so the caller can route to /platform
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const { userId, orgId: clerkActiveOrgId } = await auth()
  if (!userId) return null

  const dbUser = await findUserByClerkId(userId)
  if (!dbUser) return null

  // 1. Try Clerk's active org first
  let org = clerkActiveOrgId ? await findOrgByClerkId(clerkActiveOrgId) : null

  // 2. Fall back to the user's first Membership
  if (!org) {
    const firstMembership = await db.membership.findFirst({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'asc' },
    })
    if (firstMembership) {
      org = await db.organization.findUnique({
        where: { id: firstMembership.organizationId },
      })
    }
  }

  // 3. Platform-owner with no Memberships: placeholder ctx
  if (!org) {
    if (!dbUser.platformOwner) return null
    return {
      userId,
      orgId: '',
      role: 'admin',
      plan: 'smb',
      organizationDbId: '',
      userDbId: dbUser.id,
      platformOwner: true,
      linkedClientId: dbUser.linkedClientId,
      permissionOverrides: null,
      roleDefaults: {},
    }
  }

  const membership = await findMembership(dbUser.id, org.id)

  // No Membership, but platform owner: admin-equivalent ctx for this org
  if (!membership) {
    if (!dbUser.platformOwner) return null
    return {
      userId,
      orgId: org.clerkOrgId,
      role: 'admin',
      plan: org.plan,
      organizationDbId: org.id,
      userDbId: dbUser.id,
      platformOwner: true,
      linkedClientId: dbUser.linkedClientId,
      permissionOverrides: null,
      roleDefaults: {},
    }
  }

  // Load role defaults for this org
  const roleDefaultRows = await db.roleDefault.findMany({
    where: { organizationId: org.id },
  })
  const roleDefaults: Partial<
    Record<UserRole, Partial<Record<string, boolean>>>
  > = {}
  for (const rd of roleDefaultRows) {
    const bucket = (roleDefaults[rd.role] ??= {})
    bucket[rd.permissionKey] = rd.allow
  }

  return {
    userId,
    orgId: org.clerkOrgId,
    role: membership.role,
    plan: org.plan,
    organizationDbId: org.id,
    userDbId: dbUser.id,
    platformOwner: dbUser.platformOwner,
    linkedClientId: dbUser.linkedClientId,
    permissionOverrides:
      (membership.permissionOverrides as Record<string, boolean> | null) ?? null,
    roleDefaults,
  }
}

/** Like getOrgContext but throws if not authenticated. */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext()
  if (!ctx) throw new Error('Unauthorized')
  return ctx
}

/** Returns the current Clerk user's basic info (used during onboarding). */
export async function getClerkUser() {
  return currentUser()
}
