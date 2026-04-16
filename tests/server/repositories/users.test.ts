import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@prisma/client'

vi.mock('@/db/client', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import { findUserByClerkId, createUser } from '@/server/repositories/users'

const mockUser: User = {
  id: 'cuid_user_1',
  clerkUserId: 'user_clerk_123',
  organizationId: 'cuid_org_1',
  role: 'admin',
  email: 'julio@fiveonenine.us',
  name: 'Julio Aleman',
  avatarUrl: null,
  createdAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findUserByClerkId', () => {
  it('returns the user with their organization when found', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser)

    const result = await findUserByClerkId('user_clerk_123')

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_clerk_123' },
      include: { organization: true },
    })
    expect(result).toEqual(mockUser)
  })

  it('returns null when not found', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null)

    const result = await findUserByClerkId('user_nonexistent')

    expect(result).toBeNull()
  })
})

describe('createUser', () => {
  it('creates a user with the given fields', async () => {
    vi.mocked(db.user.create).mockResolvedValue(mockUser)

    const result = await createUser({
      clerkUserId: 'user_clerk_123',
      organizationId: 'cuid_org_1',
      email: 'julio@fiveonenine.us',
      name: 'Julio Aleman',
      role: 'admin',
    })

    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        clerkUserId: 'user_clerk_123',
        organizationId: 'cuid_org_1',
        email: 'julio@fiveonenine.us',
        name: 'Julio Aleman',
        role: 'admin',
      },
    })
    expect(result).toEqual(mockUser)
  })
})
