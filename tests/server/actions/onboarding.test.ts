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
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createOrganization).toHaveBeenCalledOnce()
    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_db', role: 'admin' }),
    )
  })

  // Helper: mock clerkClient so the invited user's invitation (matched by
  // email 'new@example.com', the default currentUser email) is returned with
  // the given Clerk binary role + publicMetadata.
  function mockInvitation(opts: {
    role: 'org:admin' | 'org:member'
    relayRole?: string
  }) {
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: {
        getOrganizationInvitationList: vi.fn().mockResolvedValue({
          data: [
            {
              emailAddress: 'new@example.com',
              role: opts.role,
              publicMetadata:
                opts.relayRole !== undefined ? { relayRole: opts.relayRole } : {},
            },
          ],
        }),
      },
    } as never)
  }

  it('honors the invited role from the invitation publicMetadata (designer)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_inv', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_inv', platformOwner: false } as never)
    mockInvitation({ role: 'org:member', relayRole: 'designer' })

    await expect(
      completeOnboarding(form({ displayName: 'Invited Person' })),
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createOrganization).not.toHaveBeenCalled()
    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'designer' }),
    )
  })

  it('honors an invited account_manager (does NOT default to admin)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_am', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_am', platformOwner: false } as never)
    mockInvitation({ role: 'org:member', relayRole: 'account_manager' })

    await expect(
      completeOnboarding(form({ displayName: 'AM Person' })),
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'account_manager' }),
    )
  })

  it('honors an invited admin (relayRole admin -> admin)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_adm', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_adm', platformOwner: false } as never)
    mockInvitation({ role: 'org:admin', relayRole: 'admin' })

    await expect(
      completeOnboarding(form({ displayName: 'Admin Person' })),
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'admin' }),
    )
  })

  it('sends an invited client to /dashboard, not /welcome (clients skip the launch pad)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_cli', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_cli', platformOwner: false } as never)
    mockInvitation({ role: 'org:member', relayRole: 'client' })

    await expect(
      completeOnboarding(form({ displayName: 'Client Person' })),
    ).rejects.toThrow('NEXT_REDIRECT:/dashboard')

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'client' }),
    )
  })

  // Regression: the bug. A metadata-less (legacy) invite at member level must
  // NOT become an admin. Fail-safe falls back to account_manager, never admin.
  it('fail-safe: a metadata-less org:member invite becomes account_manager, NOT admin', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_legacy', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_legacy', platformOwner: false } as never)
    mockInvitation({ role: 'org:member' }) // no relayRole metadata

    await expect(
      completeOnboarding(form({ displayName: 'Legacy Member' })),
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'account_manager' }),
    )
    expect(createMembership).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
    )
  })

  it('fail-safe: a metadata-less org:admin invite still maps to admin', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_legadm', orgId: 'clerk_org_admark' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)
    vi.mocked(findOrgByClerkId).mockResolvedValue({ id: 'org_admark' } as never)
    vi.mocked(createUser).mockResolvedValue({ id: 'u_legadm', platformOwner: false } as never)
    mockInvitation({ role: 'org:admin' }) // no relayRole metadata

    await expect(
      completeOnboarding(form({ displayName: 'Legacy Admin' })),
    ).rejects.toThrow('NEXT_REDIRECT:/welcome')

    expect(createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_admark', role: 'admin' }),
    )
  })
})
