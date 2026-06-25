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
import { ClerkAPIResponseError } from '@clerk/shared/error'
import { revalidatePath } from 'next/cache'
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

  it('returns { ok: true } and revalidates on success', async () => {
    const result = await inviteMember({ email: 'ok@example.com', role: 'designer' })
    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
  })

  it('returns the Clerk longMessage instead of throwing when the org quota is exceeded', async () => {
    const quotaError = new ClerkAPIResponseError('Forbidden', {
      data: [
        {
          code: 'organization_membership_quota_exceeded',
          message: 'organization membership quota exceeded',
          long_message:
            'You have reached your limit of 5 organization memberships, including outstanding invitations.',
        },
      ],
      status: 403,
    })
    createInvitation.mockRejectedValueOnce(quotaError)

    const result = await inviteMember({ email: 'payton@example.com', role: 'designer' })

    expect(result).toEqual({
      ok: false,
      error:
        'You have reached your limit of 5 organization memberships, including outstanding invitations.',
    })
    // An expected failure must NOT revalidate (no invite was created).
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('falls back to the short Clerk message when longMessage is absent', async () => {
    const err = new ClerkAPIResponseError('Conflict', {
      data: [{ code: 'duplicate_record', message: 'already invited' }],
      status: 409,
    })
    createInvitation.mockRejectedValueOnce(err)

    const result = await inviteMember({ email: 'dupe@example.com', role: 'designer' })

    expect(result).toEqual({ ok: false, error: 'already invited' })
  })

  it('rethrows unexpected (non-Clerk) errors so they are not silently swallowed', async () => {
    createInvitation.mockRejectedValueOnce(new Error('network down'))

    await expect(
      inviteMember({ email: 'boom@example.com', role: 'designer' }),
    ).rejects.toThrow('network down')
  })

  it('returns an error for an empty email without calling Clerk', async () => {
    const result = await inviteMember({ email: '   ', role: 'designer' })
    expect(result).toEqual({ ok: false, error: 'Email is required' })
    expect(createInvitation).not.toHaveBeenCalled()
  })
})
