import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({ requireOrgContext: vi.fn() }))
vi.mock('@/db/client', () => ({ db: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const updateProfileImage = vi.fn()
const deleteProfileImage = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: { updateUserProfileImage: updateProfileImage, deleteUserProfileImage: deleteProfileImage },
  })),
}))

import { updateMyAvatarAction, removeMyAvatarAction } from '@/app/(app)/settings/account/actions'
import { requireOrgContext } from '@/server/middleware/auth'
import { db } from '@/db/client'
import { del } from '@vercel/blob'

const OWN = 'https://abc.public.blob.vercel-storage.com/user-avatars/u_1/170-avatar.webp'
const realFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn(async () => ({ blob: async () => new Blob(['x']) })) as never
  vi.mocked(requireOrgContext).mockResolvedValue({ userId: 'clerk_1', userDbId: 'u_1' } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ avatarUrl: null } as never)
  vi.mocked(db.user.update).mockResolvedValue({} as never)
})
afterEach(() => { global.fetch = realFetch })

describe('updateMyAvatarAction', () => {
  it('writes avatarUrl for a valid own-prefix blob URL', async () => {
    await updateMyAvatarAction(OWN)
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u_1' }, data: { avatarUrl: OWN } }),
    )
    expect(updateProfileImage).toHaveBeenCalled()
  })
  it('rejects a URL under another user prefix (no write)', async () => {
    const other = 'https://abc.public.blob.vercel-storage.com/user-avatars/u_999/x.webp'
    await expect(updateMyAvatarAction(other)).rejects.toThrow()
    expect(db.user.update).not.toHaveBeenCalled()
  })
  it('rejects a non-blob host (no write)', async () => {
    await expect(updateMyAvatarAction('https://evil.example.com/user-avatars/u_1/x.webp')).rejects.toThrow()
    expect(db.user.update).not.toHaveBeenCalled()
  })
  it('still succeeds when the Clerk sync throws (best-effort)', async () => {
    updateProfileImage.mockRejectedValueOnce(new Error('clerk down'))
    await expect(updateMyAvatarAction(OWN)).resolves.toBeTruthy()
    expect(db.user.update).toHaveBeenCalled()
  })
  it('best-effort deletes the prior blob when replacing', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ avatarUrl: 'https://abc.public.blob.vercel-storage.com/user-avatars/u_1/old.webp' } as never)
    await updateMyAvatarAction(OWN)
    expect(del).toHaveBeenCalled()
  })
})

describe('removeMyAvatarAction', () => {
  it('nulls avatarUrl and clears the Clerk image', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ avatarUrl: OWN } as never)
    await removeMyAvatarAction()
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u_1' }, data: { avatarUrl: null } }),
    )
    expect(deleteProfileImage).toHaveBeenCalledWith('clerk_1')
  })
})
