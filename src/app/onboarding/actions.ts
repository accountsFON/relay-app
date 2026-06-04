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
import { isAgencyCreationEnabled } from '@/server/auth/agencyCreation'
import type { UserRole } from '@/lib/types'

/**
 * Where a freshly onboarded user lands. Non-client roles get the /welcome
 * launch pad; clients skip it (the (app) layout never routes a client persona
 * to /welcome). Returning the final destination here keeps onboarding to a
 * SINGLE redirect: we used to redirect to /dashboard and let the (app) layout
 * bounce first-timers on to /welcome, but that second (nested) redirect during
 * a server-action navigation rendered the welcome page blank until a manual
 * reload. One hop from here avoids the chained redirect.
 */
function firstDestination(role: UserRole): string {
  return role === 'client' ? '/dashboard' : '/welcome'
}

export async function completeOnboarding(formData: FormData) {
  const { userId, orgId: clerkActiveOrgId } = await auth()
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
  // regular users is gated through Path 2 (invite acceptance) only.
  const existingUser = await findUserByClerkId(userId)

  // Detect invite acceptance: explicit ticket in form, OR a brand-new user
  // (no DB row yet) who already has a Clerk active org. The latter handles
  // the case where Clerk's post-signup redirect drops the ticket query
  // param after consuming it.
  const isInvite =
    Boolean(inviteTicket) || (!existingUser && Boolean(clerkActiveOrgId))

  // Invite-only gate. Self-serve agency creation stays closed until sell-mode
  // (RELAY_ALLOW_AGENCY_CREATION=true). A no-invite visitor cannot create an
  // org, so bounce to the invite-only screen before any write. Defense in
  // depth with the page-level guard in page.tsx.
  if (!isInvite && !isAgencyCreationEnabled()) {
    redirect('/invite-only')
  }

  if (existingUser && !isInvite) {
    redirect('/dashboard')
  }

  if (isInvite) {
    return await handleInviteOnboarding({
      clerkUserId: userId,
      email,
      displayName,
    })
  }

  // Path 1: brand-new agency creation.
  if (!agencyName) throw new Error('Agency name is required')

  // Final guard: only users with zero Memberships may self-serve a new
  // agency. The redirect above should have caught non-zero counts, but
  // enforce here in case it's bypassed (race condition, direct action
  // call, partial state). Multi-agency membership is invite-only.
  if (existingUser) {
    const membershipCount = await db.membership.count({
      where: { userId: existingUser.id },
    })
    if (membershipCount > 0) {
      throw new Error(
        'Existing users cannot self-serve a new agency. Multi-agency membership is invite-only.',
      )
    }
  }

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

  // Brand-new agency creator is always an admin -> the /welcome launch pad,
  // in a single redirect (see firstDestination).
  redirect(firstDestination('admin'))
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

  // One hop to the role-correct destination (clients skip /welcome). Avoids
  // the onboarding -> /dashboard -> layout -> /welcome double redirect that
  // rendered the welcome page blank on first sign up.
  redirect(firstDestination(role))
}
