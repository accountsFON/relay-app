import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgContext } from '@/lib/types'

vi.mock('@/db/client', () => ({
  db: {
    post: { findUnique: vi.fn() },
    client: { findFirst: vi.fn() },
  },
}))

import { db } from '@/db/client'
import { findPostById } from '@/server/repositories/posts'

const designerCtx = {
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
    expect(await findPostById('missing', designerCtx)).toBeNull()
    expect(db.client.findFirst).not.toHaveBeenCalled()
  })

  it('scopes the client lookup by org + role assignment, and returns null when out of scope', async () => {
    vi.mocked(db.post.findUnique).mockResolvedValue({ id: 'p1', clientId: 'c1' } as never)
    vi.mocked(db.client.findFirst).mockResolvedValue(null as never)
    expect(await findPostById('p1', designerCtx)).toBeNull()
    // designer scope filter restricts to assignedDesignerId === userDbId
    expect(db.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'c1',
          organizationId: 'org-1',
          assignedDesignerId: 'user-1',
        }),
      }),
    )
  })

  it('returns the post when its client is in scope', async () => {
    const post = { id: 'p1', clientId: 'c1' }
    vi.mocked(db.post.findUnique).mockResolvedValue(post as never)
    vi.mocked(db.client.findFirst).mockResolvedValue({ id: 'c1' } as never)
    expect(await findPostById('p1', designerCtx)).toEqual(post)
  })
})
