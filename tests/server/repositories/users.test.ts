import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@prisma/client'

vi.mock('@/db/client', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    batch: { count: vi.fn() },
    client: { count: vi.fn() },
    contentRun: { count: vi.fn() },
    magicLink: { count: vi.fn() },
  },
}))

import { db } from '@/db/client'
import {
  findUserByClerkId,
  createUser,
  setUserDeactivated,
  countUserOwnedRecords,
  listActiveAssignableUsers,
  countPlatformOwners,
  findAdminRecipients,
  reassignUserOwnedRecords,
} from '@/server/repositories/users'

const mockUser: User = {
  id: 'cuid_user_1',
  clerkUserId: 'user_clerk_123',
  organizationId: 'cuid_org_1',
  role: 'admin',
  email: 'julio@fiveonenine.us',
  name: 'Julio Aleman',
  avatarUrl: null,
  linkedClientId: null,
  permissionOverrides: null,
  platformOwner: false,
  deactivatedAt: null,
  createdAt: new Date(),
  onboardingTourSeenAt: null,
  launchPadDismissedAt: null,
  seenTours: [],
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

describe('setUserDeactivated', () => {
  it('sets deactivatedAt to a Date when value is true', async () => {
    vi.mocked(db.user.update).mockResolvedValue(mockUser)

    await setUserDeactivated('cuid_user_1', true)

    expect(db.user.update).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(db.user.update).mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'cuid_user_1' })
    expect(arg.data.deactivatedAt).toBeInstanceOf(Date)
  })

  it('clears deactivatedAt to null when value is false', async () => {
    vi.mocked(db.user.update).mockResolvedValue(mockUser)

    await setUserDeactivated('cuid_user_1', false)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'cuid_user_1' },
      data: { deactivatedAt: null },
    })
  })
})

describe('countUserOwnedRecords', () => {
  it('returns the count shape from the five count queries', async () => {
    vi.mocked(db.batch.count).mockResolvedValue(2)
    vi.mocked(db.client.count)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
    vi.mocked(db.contentRun.count).mockResolvedValue(5)
    vi.mocked(db.magicLink.count).mockResolvedValue(6)

    const result = await countUserOwnedRecords('cuid_user_1', 'cuid_org_1')

    expect(db.batch.count).toHaveBeenCalledWith({
      where: { currentHolder: 'cuid_user_1' },
    })
    expect(db.client.count).toHaveBeenNthCalledWith(1, {
      where: { assignedAmId: 'cuid_user_1', organizationId: 'cuid_org_1' },
    })
    expect(db.client.count).toHaveBeenNthCalledWith(2, {
      where: { assignedDesignerId: 'cuid_user_1', organizationId: 'cuid_org_1' },
    })
    expect(db.contentRun.count).toHaveBeenCalledWith({
      where: { triggeredById: 'cuid_user_1' },
    })
    expect(db.magicLink.count).toHaveBeenCalledWith({
      where: { createdBy: 'cuid_user_1' },
    })
    expect(result).toEqual({
      heldBatches: 2,
      assignedAmClients: 3,
      assignedDesignerClients: 4,
      triggeredRuns: 5,
      createdMagicLinks: 6,
    })
  })
})

describe('listActiveAssignableUsers', () => {
  it('queries active users in the org, excluding the given user', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([])

    await listActiveAssignableUsers('cuid_org_1', 'cuid_user_1')

    expect(db.user.findMany).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(db.user.findMany).mock.calls[0][0]
    expect(arg?.where).toMatchObject({
      deactivatedAt: null,
      id: { not: 'cuid_user_1' },
      memberships: { some: { organizationId: 'cuid_org_1' } },
    })
  })
})

describe('countPlatformOwners', () => {
  it('counts users with platformOwner true', async () => {
    vi.mocked(db.user.count).mockResolvedValue(1)

    const result = await countPlatformOwners()

    expect(db.user.count).toHaveBeenCalledWith({
      where: { platformOwner: true },
    })
    expect(result).toBe(1)
  })
})

describe('findAdminRecipients', () => {
  it('excludes deactivated users from the where clause', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([])

    await findAdminRecipients()

    expect(db.user.findMany).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(db.user.findMany).mock.calls[0][0]
    expect(arg?.where).toMatchObject({ deactivatedAt: null })
  })
})

describe('reassignUserOwnedRecords', () => {
  it('reassigns every Restrict FK off fromUserId onto toUserId within the tx', async () => {
    const tx = {
      batch: { updateMany: vi.fn() },
      client: { updateMany: vi.fn() },
      contentRun: { updateMany: vi.fn() },
      magicLink: { updateMany: vi.fn() },
      permissionAuditLog: { updateMany: vi.fn() },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reassignUserOwnedRecords(tx as any, 'from_user', 'to_user')

    expect(tx.batch.updateMany).toHaveBeenCalledWith({
      where: { currentHolder: 'from_user' },
      data: { currentHolder: 'to_user' },
    })
    expect(tx.client.updateMany).toHaveBeenNthCalledWith(1, {
      where: { assignedAmId: 'from_user' },
      data: { assignedAmId: 'to_user' },
    })
    expect(tx.client.updateMany).toHaveBeenNthCalledWith(2, {
      where: { assignedDesignerId: 'from_user' },
      data: { assignedDesignerId: 'to_user' },
    })
    expect(tx.contentRun.updateMany).toHaveBeenCalledWith({
      where: { triggeredById: 'from_user' },
      data: { triggeredById: 'to_user' },
    })
    expect(tx.magicLink.updateMany).toHaveBeenCalledWith({
      where: { createdBy: 'from_user' },
      data: { createdBy: 'to_user' },
    })
    expect(tx.permissionAuditLog.updateMany).toHaveBeenNthCalledWith(1, {
      where: { actorUserId: 'from_user' },
      data: { actorUserId: 'to_user' },
    })
    expect(tx.permissionAuditLog.updateMany).toHaveBeenNthCalledWith(2, {
      where: { targetUserId: 'from_user' },
      data: { targetUserId: null },
    })
  })
})
