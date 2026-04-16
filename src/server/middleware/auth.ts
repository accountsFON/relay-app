import { auth, currentUser } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import { findOrgByClerkId } from '@/server/repositories/organizations'
import type { OrgContext } from '@/lib/types'

/**
 * Resolves the current Clerk session to a full OrgContext.
 * Returns null if the user is not authenticated or not yet in the DB.
 * Use in Server Components and Server Actions.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return null

  const dbUser = await findUserByClerkId(userId)
  if (!dbUser) return null

  const org = await findOrgByClerkId(orgId)
  if (!org) return null

  return {
    userId,
    orgId,
    role: dbUser.role as OrgContext['role'],
    plan: org.plan as OrgContext['plan'],
    organizationDbId: org.id,
    userDbId: dbUser.id,
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
