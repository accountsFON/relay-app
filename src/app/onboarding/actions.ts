'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { createOrganization } from '@/server/repositories/organizations'
import { createUser } from '@/server/repositories/users'
import type { Plan } from '@/lib/types'

export async function completeOnboarding(formData: FormData) {
  const { userId, orgId } = await auth()
  const clerkUser = await currentUser()

  if (!userId || !orgId || !clerkUser) {
    throw new Error('Not authenticated')
  }

  const orgName = formData.get('orgName') as string
  const plan = formData.get('plan') as Plan

  if (!orgName || !plan) {
    throw new Error('Missing required fields')
  }

  const org = await createOrganization({
    clerkOrgId: orgId,
    name: orgName,
    plan,
  })

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')

  await createUser({
    clerkUserId: userId,
    organizationId: org.id,
    email,
    name,
    role: 'admin',
  })

  redirect('/dashboard')
}
