'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { findUserByClerkId } from '@/server/repositories/users'
import { createOrganization } from '@/server/repositories/organizations'
import type { Plan } from '@/lib/types'

/**
 * Create a brand new agency. Platform-owner only.
 *
 * Creates the org in Clerk first (so we have a real Clerk Org ID), then
 * mirrors a row in our DB. The platform owner becomes the Clerk org
 * creator (an admin Clerk member); they do NOT get a DB Membership in
 * the new org, since their platformOwner badge already grants access.
 */
export async function createAgency(input: { name: string; plan: Plan }) {
  const { userId } = await auth()
  if (!userId) throw new Error('Unauthorized')

  const dbUser = await findUserByClerkId(userId)
  if (!dbUser?.platformOwner) {
    throw new Error('Forbidden: platform owner only')
  }

  const name = input.name.trim()
  if (!name) throw new Error('Name required')

  const clerk = await clerkClient()
  const clerkOrg = await clerk.organizations.createOrganization({
    name,
    createdBy: userId,
  })

  const org = await createOrganization({
    clerkOrgId: clerkOrg.id,
    name,
    plan: input.plan,
  })

  revalidatePath('/platform')
  return { orgId: org.id, clerkOrgId: clerkOrg.id }
}
