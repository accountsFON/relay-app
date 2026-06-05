import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireAdminPortal: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireAdminPortal } from '@/server/middleware/permissions'
import { clerkClient } from '@clerk/nextjs/server'
import { inviteMember } from '@/app/(app)/admin/users/invite-actions'

const createInvitation = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPortal).mockResolvedValue({
    orgId: 'clerk_org',
    userId: 'clerk_admin',
  } as never)
  createInvitation.mockResolvedValue({})
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: { createOrganizationInvitation: createInvitation },
  } as never)
})

describe('inviteMember', () => {
  it('carries the exact role on the invitation publicMetadata (designer -> org:member + relayRole)', async () => {
    await inviteMember({ email: 'Designer@Example.com', role: 'designer' })
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: 'designer@example.com',
        role: 'org:member',
        publicMetadata: { relayRole: 'designer' },
      }),
    )
  })

  it('maps account_manager to org:member but tags relayRole account_manager', async () => {
    await inviteMember({ email: 'am@example.com', role: 'account_manager' })
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'org:member',
        publicMetadata: { relayRole: 'account_manager' },
      }),
    )
  })

  it('maps admin to org:admin and tags relayRole admin', async () => {
    await inviteMember({ email: 'admin@example.com', role: 'admin' })
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'org:admin',
        publicMetadata: { relayRole: 'admin' },
      }),
    )
  })
})
