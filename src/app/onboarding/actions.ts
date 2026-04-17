'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { findOrgByClerkId, createOrganization } from '@/server/repositories/organizations'
import { findUserByClerkId, createUser } from '@/server/repositories/users'

// Single org identifier — all users belong to the Five One Nine org.
// In v2 (multi-org), this becomes dynamic.
const FON_ORG_CLERK_ID = 'fon-internal'

export async function completeOnboarding(formData: FormData) {
  const { userId } = await auth()
  const clerkUser = await currentUser()

  if (!userId || !clerkUser) {
    throw new Error('Not authenticated')
  }

  const displayName = formData.get('displayName') as string
  if (!displayName) {
    throw new Error('Display name is required')
  }

  // Find or create the single org
  let org = await findOrgByClerkId(FON_ORG_CLERK_ID)
  if (!org) {
    org = await createOrganization({
      clerkOrgId: FON_ORG_CLERK_ID,
      name: 'Five One Nine Marketing',
      plan: 'agency',
    })
  }

  // Skip user creation if already exists (e.g. back-button re-submit)
  const existingUser = await findUserByClerkId(userId)
  if (!existingUser) {
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
    await createUser({
      clerkUserId: userId,
      organizationId: org.id,
      email,
      name: displayName,
      role: 'admin',
    })
  }

  redirect('/dashboard')
}
