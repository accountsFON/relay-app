import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error('NEXT_REDIRECT:' + url)
  }),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: { membership: { count: vi.fn() }, user: { update: vi.fn() } },
}))

vi.mock('@/server/repositories/users', () => ({
  findUserByClerkId: vi.fn(),
  createUser: vi.fn(),
}))

vi.mock('@/server/repositories/organizations', () => ({
  findOrgByClerkId: vi.fn(),
  createOrganization: vi.fn(),
}))

vi.mock('@/server/repositories/memberships', () => ({
  createMembership: vi.fn(),
}))

vi.mock('@/server/auth/platformOwner', () => ({
  isPlatformOwnerEmail: vi.fn(() => false),
}))

vi.mock('@/server/auth/agencyCreation', () => ({
  isAgencyCreationEnabled: vi.fn(),
}))

import { auth, currentUser, clerkClient } from '@clerk/nextjs/server'
import { findUserByClerkId, createUser } from '@/server/repositories/users'
import {
  findOrgByClerkId,
  createOrganization,
} from '@/server/repositories/organizations'
import { createMembership } from '@/server/repositories/memberships'
import { isAgencyCreationEnabled } from '@/server/auth/agencyCreation'
import { completeOnboarding } from '@/app/onboarding/actions'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUser).mockResolvedValue({
    emailAddresses: [{ emailAddress: 'new@example.com' }],
  } as never)
})

describe('completeOnboarding invite-only gate', () => {
  it('blocks a no-invite user when creation is OFF and never creates an org', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_new', orgId: null } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)

    await expect(
      completeOnboarding(form({ displayName: 'New Person', agencyName: 'Sneaky LLC' })),
    ).rejects.toThrow('NEXT_REDIRECT:/invite-only')

    expect(createOrganization).not.toHaveBeenCalled()
    expect(createMembership).not.toHaveBeenCalled()
  })

  it('allows agency creation when the flag is ON (sell-mode)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_new', orgId: null } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(true)
    vi.mocked(createOrganization).mockResolvedValue({ id: 'org_db' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_db', platformOwner: false } as never)
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { createOrganization: vi.fn().mockResolvedValue({ id: 'clerk_org_new' }) },
    } as never)

    await expect(
      completeOnboarding(form({ displayName: 'New Person', agencyName: 'Acme Marketing' })),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')

    expect(createOrganization).toHaveBeenCalledOnce()
    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_db', role: 'admin' }),
    )
  })

  it('lets an invited user join the inviting org regardless of the flag', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_inv', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_inv', platformOwner: false } as never)
    vi.mocked(clerkClient).mockResolvedValue({
      users: {
        getOrganizationMembershipList: vi.fn().mockResolvedValue({
          data: [{ organization: { id: 'clerk_org_admark' }, role: 'designer' }],
        }),
      },
    } as never)

    await expect(
      completeOnboarding(form({ displayName: 'Invited Person' })),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')

    expect(createOrganization).not.toHaveBeenCalled()
    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'designer' }),
    )
  })
})
