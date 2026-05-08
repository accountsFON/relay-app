'use server'

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { findUserByClerkId, createUser } from '@/server/repositories/users'
import {
  findOrgByClerkId,
  createOrganization,
} from '@/server/repositories/organizations'
import { createMembership } from '@/server/repositories/memberships'
import { isPlatformOwnerEmail } from '@/server/auth/platformOwner'
import type { UserRole } from '@/lib/types'

export async function completeOnboarding(formData: FormData) {
  const { userId } = await auth()
  const clerkUser = await currentUser()
  if (!userId || !clerkUser) throw new Error('Not authenticated')

  const displayName = (formData.get('displayName') as string)?.trim()
  const agencyName = (formData.get('agencyName') as string)?.trim()
  const inviteTicket = (formData.get('inviteTicket') as string)?.trim() || null

  if (!displayName) throw new Error('Display name is required')

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
  if (!email) throw new Error('Email missing on Clerk user')

  // Defense-in-depth against the page-level check: existing users cannot
  // create additional agencies via Path 1. Multi-agency membership for
  // regular users is gated through Path 2 (invite ticket) only.
  const existingUser = await findUserByClerkId(userId)
  if (existingUser && !inviteTicket) {
    redirect('/dashboard')
  }

  if (inviteTicket) {
    return await handleInviteOnboarding({
      clerkUserId: userId,
      email,
      displayName,
    })
  }

  // Path 1: brand-new agency creation.
  if (!agencyName) throw new Error('Agency name is required')

  const clerk = await clerkClient()
  const clerkOrg = await clerk.organizations.createOrganization({
    name: agencyName,
    createdBy: userId,
  })

  const org = await createOrganization({
    clerkOrgId: clerkOrg.id,
    name: agencyName,
    plan: 'smb',
  })

  const platformOwner = isPlatformOwnerEmail(email)

  let user = await findUserByClerkId(userId)
  if (!user) {
    user = await createUser({
      clerkUserId: userId,
      organizationId: org.id,
      email,
      name: displayName,
      role: 'admin',
    })
  }
  if (platformOwner && !user.platformOwner) {
    await db.user.update({
      where: { id: user.id },
      data: { platformOwner: true },
    })
  }

  await createMembership({
    userId: user.id,
    organizationId: org.id,
    role: 'admin',
  })

  redirect('/dashboard')
}

async function handleInviteOnboarding(input: {
  clerkUserId: string
  email: string
  displayName: string
}) {
  const { orgId: clerkActiveOrgId } = await auth()
  if (!clerkActiveOrgId) {
    throw new Error('Invite onboarding has no active org. Re-attempt invite.')
  }

  const org = await findOrgByClerkId(clerkActiveOrgId)
  if (!org) {
    throw new Error('Invited to an unknown agency. Contact support.')
  }

  const platformOwner = isPlatformOwnerEmail(input.email)

  let user = await findUserByClerkId(input.clerkUserId)
  if (!user) {
    user = await createUser({
      clerkUserId: input.clerkUserId,
      organizationId: org.id,
      email: input.email,
      name: input.displayName,
      role: 'admin', // legacy field; Membership below carries the real role
    })
  }
  if (platformOwner && !user.platformOwner) {
    await db.user.update({
      where: { id: user.id },
      data: { platformOwner: true },
    })
  }

  // Read the role Clerk attached to this user's organization membership
  // when the invite was accepted.
  const clerk = await clerkClient()
  const memberships = await clerk.users.getOrganizationMembershipList({
    userId: input.clerkUserId,
  })
  const thisMembership = memberships.data.find(
    (m) => m.organization.id === clerkActiveOrgId,
  )

  // Map Clerk's role string to our UserRole. Clerk role keys configured in
  // dashboard are expected to match: admin, account_manager, designer, client.
  const KNOWN_ROLES: UserRole[] = ['admin', 'account_manager', 'designer', 'client']
  const clerkRole = thisMembership?.role ?? 'admin'
  const role = KNOWN_ROLES.includes(clerkRole as UserRole)
    ? (clerkRole as UserRole)
    : 'admin'

  await createMembership({
    userId: user.id,
    organizationId: org.id,
    role,
  })

  redirect('/dashboard')
}
