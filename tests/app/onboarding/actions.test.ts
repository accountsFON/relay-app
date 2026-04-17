import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock('@/server/repositories/organizations', () => ({
  findOrgByClerkId: vi.fn(),
  createOrganization: vi.fn(),
}))

vi.mock('@/server/repositories/users', () => ({
  createUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { auth, currentUser } from '@clerk/nextjs/server'
import { findOrgByClerkId, createOrganization } from '@/server/repositories/organizations'
import { createUser } from '@/server/repositories/users'
import { redirect } from 'next/navigation'
import { completeOnboarding } from '@/app/onboarding/actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({
    userId: 'user_clerk_123',
  } as any)
  vi.mocked(currentUser).mockResolvedValue({
    id: 'user_clerk_123',
    emailAddresses: [{ emailAddress: 'julio@fiveonenine.us' }],
    firstName: 'Julio',
    lastName: 'Aleman',
  } as any)
})

describe('completeOnboarding', () => {
  it('finds or creates the org, creates the user, then redirects to dashboard', async () => {
    vi.mocked(findOrgByClerkId).mockResolvedValue(null) // first run, org doesn't exist
    vi.mocked(createOrganization).mockResolvedValue({ id: 'cuid_org_1' } as any)
    vi.mocked(createUser).mockResolvedValue({ id: 'cuid_user_1' } as any)

    const formData = new FormData()
    formData.set('displayName', 'Julio Aleman')

    await completeOnboarding(formData)

    expect(createOrganization).toHaveBeenCalledWith({
      clerkOrgId: 'fon-internal',
      name: 'Five One Nine Marketing',
      plan: 'agency',
    })
    expect(createUser).toHaveBeenCalledWith({
      clerkUserId: 'user_clerk_123',
      organizationId: 'cuid_org_1',
      email: 'julio@fiveonenine.us',
      name: 'Julio Aleman',
      role: 'admin',
    })
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('reuses existing org on subsequent sign-ups', async () => {
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'cuid_org_1' } as any)
    vi.mocked(createUser).mockResolvedValue({ id: 'cuid_user_2' } as any)

    const formData = new FormData()
    formData.set('displayName', 'Mollie Huebner')

    await completeOnboarding(formData)

    expect(createOrganization).not.toHaveBeenCalled()
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'cuid_org_1' })
    )
  })
})
