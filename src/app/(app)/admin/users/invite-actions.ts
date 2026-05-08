'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import type { UserRole } from '@/lib/types'

/**
 * Sends a Clerk org invitation. The role must match a custom role
 * configured in the Clerk dashboard. Recipient lands on /sign-up with
 * a __clerk_ticket query param; onboarding's Path 2 then creates the
 * User row + Membership in our DB.
 */
export async function inviteMember(input: {
  email: string
  role: UserRole
}) {
  const ctx = await requireAdminPortal()

  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  const clerk = await clerkClient()
  await clerk.organizations.createOrganizationInvitation({
    organizationId: ctx.orgId,
    inviterUserId: ctx.userId,
    emailAddress: email,
    role: input.role,
  })

  revalidatePath('/admin/users')
  return { ok: true }
}
