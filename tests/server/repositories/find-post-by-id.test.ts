import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgContext } from '@/lib/types'

vi.mock('@/db/client', () => ({
  db: { post: { findUnique: vi.fn() } },
}))
vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

import { db } from '@/db/client'
import { findClientForUser } from '@/server/repositories/clients'
import { findPostById } from '@/server/repositories/posts'

const ctx = {
  userId: 'clerk_u1',
  orgId: 'clerk_o1',
  role: 'designer',
  plan: 'smb',
  organizationDbId: 'org-1',
  userDbId: 'user-1',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
} as OrgContext

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findPostById (client-scoped)', () => {
  it('returns null when the post does not exist (and does not scope-check)', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue(null as never)
    expect(await findPostById('missing', ctx)).toBeNull()
    expect(findClientForUser).not.toHaveBeenCalled()
  })

  it('returns null when the post exists but its client is out of scope', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({ id: 'p1', clientId: 'c1' } as never)
    vi.mocked(findClientForUser).mockResolvedValue(null as never)
    expect(await findPostById('p1', ctx)).toBeNull()
    expect(findClientForUser).toHaveBeenCalledWith(ctx, 'c1')
  })

  it('returns the post when its client is in scope', async () => {
    const post = { id: 'p1', clientId: 'c1' }
    vi.mocked(db.post.findUnique).mockResolvedValue(post as never)
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'c1' } as never)
    expect(await findPostById('p1', ctx)).toEqual(post)
    expect(findClientForUser).toHaveBeenCalledWith(ctx, 'c1')
  })
})
