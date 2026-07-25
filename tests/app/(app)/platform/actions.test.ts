import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/server/repositories/users', () => ({ findUserByClerkId: vi.fn() }))
vi.mock('@/server/repositories/organizations', () => ({ createOrganization: vi.fn() }))

import { auth, clerkClient } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import { createOrganization } from '@/server/repositories/organizations'
import { createAgency } from '@/app/(app)/platform/actions'

describe('createAgency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the Clerk org uncapped (maxAllowedMemberships: 0)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_owner' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue({ platformOwner: true } as never)
    vi.mocked(createOrganization).mockResolvedValue({ id: 'org_db' } as never)
    const clerkCreateOrg = vi.fn().mockResolvedValue({ id: 'clerk_org_new' })
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { createOrganization: clerkCreateOrg },
    } as never)

    await createAgency({ name: 'Big Agency', plan: 'smb' })

    expect(clerkCreateOrg).toHaveBeenCalledWith(
      expect.objectContaining({ maxAllowedMemberships: 0 }),
    )
  })

  it('rejects a non platform owner without creating anything', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_user' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue({ platformOwner: false } as never)

    await expect(createAgency({ name: 'Nope', plan: 'smb' })).rejects.toThrow(
      'Forbidden: platform owner only',
    )
    expect(createOrganization).not.toHaveBeenCalled()
  })
})
