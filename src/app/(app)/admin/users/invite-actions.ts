'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { requireAdminPortal } from '@/server/middleware/permissions'
import type { UserRole } from '@/lib/types'

/**
 * Sends a Clerk org invitation. Maps our DB UserRole down to Clerk's two
 * built-in role keys (org:admin / org:member). Fine-grained permissions
 * live on the Membership row created by onboarding's Path 2; Clerk only
 * tracks the binary admin/member flag.
 */
export async function inviteMember(input: {
  email: string
  role: UserRole
}) {
  const ctx = await requireAdminPortal()

  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  const clerkRole = input.role === 'admin' ? 'org:admin' : 'org:member'

  const clerk = await clerkClient()
  await clerk.organizations.createOrganizationInvitation({
    organizationId: ctx.orgId,
    inviterUserId: ctx.userId,
    emailAddress: email,
    role: clerkRole,
  })

  revalidatePath('/admin/users')
  return { ok: true }
}
