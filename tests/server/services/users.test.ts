import { describe, it, expect, vi, beforeEach } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = any

// ---------------------------------------------------------------------------
// Repo helper mocks. We mock at the @/server/repositories/users boundary so we
// can assert the service calls reassignUserOwnedRecords + countPlatformOwners.
// ---------------------------------------------------------------------------
vi.mock('@/server/repositories/users', () => ({
  reassignUserOwnedRecords: vi.fn(),
  countPlatformOwners: vi.fn(async () => 2),
  findOrgsWhereLastActiveAdmin: vi.fn(async () => []),
}))

// ---------------------------------------------------------------------------
// Clerk backend mock. deleteUserMock lets us assert call args + simulate the
// 404-tolerant / non-404-throws paths.
// ---------------------------------------------------------------------------
const deleteUserMock = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: deleteUserMock } })),
}))

// ---------------------------------------------------------------------------
// Prisma mock. A recording tx is handed to every db.$transaction callback, and
// top-level db.user.findUnique / db.user.delete are recorded too. (target +
// reassign-target lookups both use db.user.findUnique; the service does target
// first, then reassign target, so tests use mockResolvedValueOnce in order.)
// ---------------------------------------------------------------------------
type Calls = Record<string, unknown[][]>

function makeTx(): { tx: AnyMock; calls: Calls } {
  const calls: Calls = {
    'user.update': [],
    'permissionAuditLog.create': [],
  }
  const tx = {
    user: {
      update: vi.fn(async (args: unknown) => {
        calls['user.update'].push([args])
        return {}
      }),
    },
    permissionAuditLog: {
      create: vi.fn(async (args: unknown) => {
        calls['permissionAuditLog.create'].push([args])
        return {}
      }),
    },
  }
  return { tx, calls }
}

let currentTx: { tx: AnyMock; calls: Calls }

const findUniqueMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('@/db/client', () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: AnyMock) => Promise<unknown>) =>
      fn(currentTx.tx),
    ),
    user: {
      findUnique: (args: unknown) => findUniqueMock(args),
      delete: (args: unknown) => deleteMock(args),
    },
  },
}))

import {
  UserServiceError,
  deactivateUser,
  reactivateUser,
  hardDeleteUser,
  getSelfDeactivationBlock,
  selfDeactivateUser,
} from '@/server/services/users'
import {
  reassignUserOwnedRecords,
  countPlatformOwners,
  findOrgsWhereLastActiveAdmin,
} from '@/server/repositories/users'

beforeEach(() => {
  currentTx = makeTx()
  deleteUserMock.mockReset()
  deleteUserMock.mockResolvedValue(undefined)
  findUniqueMock.mockReset()
  deleteMock.mockReset()
  deleteMock.mockResolvedValue({})
  vi.mocked(reassignUserOwnedRecords).mockReset()
  vi.mocked(reassignUserOwnedRecords).mockResolvedValue(undefined)
  vi.mocked(countPlatformOwners).mockReset()
  vi.mocked(countPlatformOwners).mockResolvedValue(2)
  vi.mocked(findOrgsWhereLastActiveAdmin).mockReset()
  vi.mocked(findOrgsWhereLastActiveAdmin).mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// deactivateUser
// ---------------------------------------------------------------------------
describe('deactivateUser', () => {
  it('sets deactivatedAt + writes user.deactivated audit row', async () => {
    const result = await deactivateUser({
      userId: 'u_target',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({ userId: 'u_target', deactivated: true })

    expect(currentTx.tx.user.update).toHaveBeenCalledOnce()
    const updateArgs = currentTx.tx.user.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'u_target' })
    expect(updateArgs.data.deactivatedAt).toBeInstanceOf(Date)

    expect(currentTx.tx.permissionAuditLog.create).toHaveBeenCalledOnce()
    const auditArgs = currentTx.tx.permissionAuditLog.create.mock.calls[0][0]
    expect(auditArgs.data.permissionKey).toBe('user.deactivated')
    expect(auditArgs.data.targetUserId).toBe('u_target')
    expect(auditArgs.data.actorUserId).toBe('u_actor')
    expect(auditArgs.data.organizationId).toBe('org_1')
  })

  it('throws when deactivating your own account', async () => {
    await expect(
      deactivateUser({
        userId: 'u_self',
        actorId: 'u_self',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(UserServiceError)
    expect(currentTx.tx.user.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// reactivateUser
// ---------------------------------------------------------------------------
describe('reactivateUser', () => {
  it('clears deactivatedAt + writes user.reactivated audit row', async () => {
    const result = await reactivateUser({
      userId: 'u_target',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({ userId: 'u_target', deactivated: false })

    expect(currentTx.tx.user.update).toHaveBeenCalledOnce()
    const updateArgs = currentTx.tx.user.update.mock.calls[0][0]
    expect(updateArgs.data.deactivatedAt).toBeNull()

    const auditArgs = currentTx.tx.permissionAuditLog.create.mock.calls[0][0]
    expect(auditArgs.data.permissionKey).toBe('user.reactivated')
    expect(auditArgs.data.targetUserId).toBe('u_target')
  })
})

// ---------------------------------------------------------------------------
// hardDeleteUser guards: each throws, and asserts NO db.user.delete + NO Clerk
// ---------------------------------------------------------------------------
describe('hardDeleteUser guards', () => {
  function expectNoDestructiveCalls() {
    expect(deleteMock).not.toHaveBeenCalled()
    expect(deleteUserMock).not.toHaveBeenCalled()
  }

  it('refuses deleting your own account', async () => {
    await expect(
      hardDeleteUser({
        userId: 'u_self',
        reassignToUserId: 'u_other',
        actorId: 'u_self',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(UserServiceError)
    expectNoDestructiveCalls()
  })

  it('refuses reassigning to the user being deleted', async () => {
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_target',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(UserServiceError)
    expectNoDestructiveCalls()
  })

  it('refuses when the target user is not found', async () => {
    findUniqueMock.mockResolvedValueOnce(null)
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_other',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/not found/i)
    expectNoDestructiveCalls()
  })

  it('refuses when the target is not deactivated', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'u_target',
      email: 'dup@x.com',
      clerkUserId: 'clerk_target',
      platformOwner: false,
      deactivatedAt: null,
    })
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_other',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/[Dd]eactivate/)
    expectNoDestructiveCalls()
  })

  it('refuses deleting the last platform owner', async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: 'u_target',
      email: 'owner@x.com',
      clerkUserId: 'clerk_target',
      platformOwner: true,
      deactivatedAt: new Date(),
    })
    vi.mocked(countPlatformOwners).mockResolvedValueOnce(1)
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_other',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/platform owner/i)
    expectNoDestructiveCalls()
  })

  it('refuses when the reassign target does not exist', async () => {
    findUniqueMock
      // target lookup
      .mockResolvedValueOnce({
        id: 'u_target',
        email: 'dup@x.com',
        clerkUserId: 'clerk_target',
        platformOwner: false,
        deactivatedAt: new Date(),
      })
      // reassign target lookup
      .mockResolvedValueOnce(null)
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_missing',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/valid active user/i)
    expectNoDestructiveCalls()
  })

  it('refuses when the reassign target is itself deactivated', async () => {
    findUniqueMock
      .mockResolvedValueOnce({
        id: 'u_target',
        email: 'dup@x.com',
        clerkUserId: 'clerk_target',
        platformOwner: false,
        deactivatedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 'u_other', deactivatedAt: new Date() })
    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_other',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/valid active user/i)
    expectNoDestructiveCalls()
  })
})

// ---------------------------------------------------------------------------
// hardDeleteUser happy path
// ---------------------------------------------------------------------------
describe('hardDeleteUser happy path', () => {
  function seedValidTarget() {
    findUniqueMock
      .mockResolvedValueOnce({
        id: 'u_target',
        email: 'dup@x.com',
        clerkUserId: 'clerk_target',
        platformOwner: false,
        deactivatedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 'u_other', deactivatedAt: null })
  }

  it('reassigns, audits, deletes Clerk identity, then deletes the row', async () => {
    seedValidTarget()
    const result = await hardDeleteUser({
      userId: 'u_target',
      reassignToUserId: 'u_other',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })

    // reassign ran inside the txn
    expect(reassignUserOwnedRecords).toHaveBeenCalledOnce()
    expect(reassignUserOwnedRecords).toHaveBeenCalledWith(
      currentTx.tx,
      'u_target',
      'u_other',
    )

    // hard-delete audit row: targetUserId MUST be null (Restrict FK), email
    // embedded in permissionKey.
    const auditArgs = currentTx.tx.permissionAuditLog.create.mock.calls[0][0]
    expect(auditArgs.data.targetUserId).toBeNull()
    expect(auditArgs.data.permissionKey).toContain('dup@x.com')
    expect(auditArgs.data.permissionKey).toBe('user.hard_deleted:dup@x.com')

    // Clerk delete used the target's clerkUserId
    expect(deleteUserMock).toHaveBeenCalledWith('clerk_target')

    // DB row delete by id
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'u_target' } })

    expect(result).toEqual({
      deletedUserId: 'u_target',
      reassignedToUserId: 'u_other',
      clerkDeleted: true,
    })
  })

  it('allows deleting a platform owner when more than one remains', async () => {
    findUniqueMock
      .mockResolvedValueOnce({
        id: 'u_target',
        email: 'owner@x.com',
        clerkUserId: 'clerk_owner',
        platformOwner: true,
        deactivatedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 'u_other', deactivatedAt: null })
    vi.mocked(countPlatformOwners).mockResolvedValueOnce(2)

    const result = await hardDeleteUser({
      userId: 'u_target',
      reassignToUserId: 'u_other',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result.clerkDeleted).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'u_target' } })
  })
})

// ---------------------------------------------------------------------------
// Clerk failure modes
// ---------------------------------------------------------------------------
describe('hardDeleteUser Clerk failure handling', () => {
  function seedValidTarget() {
    findUniqueMock
      .mockResolvedValueOnce({
        id: 'u_target',
        email: 'dup@x.com',
        clerkUserId: 'clerk_target',
        platformOwner: false,
        deactivatedAt: new Date(),
      })
      .mockResolvedValueOnce({ id: 'u_other', deactivatedAt: null })
  }

  it('tolerates a Clerk 404 (identity already gone): row still deleted', async () => {
    seedValidTarget()
    deleteUserMock.mockRejectedValueOnce({ status: 404 })

    const result = await hardDeleteUser({
      userId: 'u_target',
      reassignToUserId: 'u_other',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result.clerkDeleted).toBe(false)
    // CRITICAL: the DB row delete STILL runs on a 404.
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: 'u_target' } })
  })

  it('aborts BEFORE the row delete on a non-404 Clerk failure', async () => {
    seedValidTarget()
    deleteUserMock.mockRejectedValueOnce({ status: 500 })

    await expect(
      hardDeleteUser({
        userId: 'u_target',
        reassignToUserId: 'u_other',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(UserServiceError)

    // KEY SAFETY PROPERTY: the row was NOT deleted because the Clerk identity
    // could not be removed. The user remains reassigned + deactivated.
    expect(deleteMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getSelfDeactivationBlock
// ---------------------------------------------------------------------------
describe('getSelfDeactivationBlock', () => {
  it('is not blocked for a normal member', async () => {
    const block = await getSelfDeactivationBlock({
      userId: 'u_1',
      isPlatformOwner: false,
    })
    expect(block).toEqual({ blocked: false, reason: null })
  })

  it('blocks the last platform owner', async () => {
    vi.mocked(countPlatformOwners).mockResolvedValueOnce(1)
    const block = await getSelfDeactivationBlock({
      userId: 'u_1',
      isPlatformOwner: true,
    })
    expect(block.blocked).toBe(true)
    expect(block.reason).toMatch(/last platform owner/i)
  })

  it('does not run the platform owner check for a non owner', async () => {
    await getSelfDeactivationBlock({ userId: 'u_1', isPlatformOwner: false })
    expect(countPlatformOwners).not.toHaveBeenCalled()
  })

  it('blocks the last admin of an org and names it', async () => {
    vi.mocked(findOrgsWhereLastActiveAdmin).mockResolvedValueOnce([
      { id: 'org_solo', name: 'Solo Agency' },
    ])
    const block = await getSelfDeactivationBlock({
      userId: 'u_1',
      isPlatformOwner: false,
    })
    expect(block.blocked).toBe(true)
    expect(block.reason).toContain('Solo Agency')
  })
})

// ---------------------------------------------------------------------------
// selfDeactivateUser
// ---------------------------------------------------------------------------
describe('selfDeactivateUser', () => {
  it('sets deactivatedAt + writes a user.self_deactivated audit row for the actor', async () => {
    const result = await selfDeactivateUser({
      actorId: 'u_self',
      actorOrganizationId: 'org_1',
      actorIsPlatformOwner: false,
    })
    expect(result).toEqual({ userId: 'u_self', deactivated: true })

    expect(currentTx.tx.user.update).toHaveBeenCalledOnce()
    const updateArgs = currentTx.tx.user.update.mock.calls[0][0]
    expect(updateArgs.where).toEqual({ id: 'u_self' })
    expect(updateArgs.data.deactivatedAt).toBeInstanceOf(Date)

    expect(currentTx.tx.permissionAuditLog.create).toHaveBeenCalledOnce()
    const auditArgs = currentTx.tx.permissionAuditLog.create.mock.calls[0][0]
    expect(auditArgs.data.permissionKey).toBe('user.self_deactivated')
    expect(auditArgs.data.actorUserId).toBe('u_self')
    expect(auditArgs.data.targetUserId).toBe('u_self')
    expect(auditArgs.data.organizationId).toBe('org_1')
  })

  it('throws and does not write when the guard blocks (last admin)', async () => {
    vi.mocked(findOrgsWhereLastActiveAdmin).mockResolvedValueOnce([
      { id: 'org_solo', name: 'Solo Agency' },
    ])
    await expect(
      selfDeactivateUser({
        actorId: 'u_self',
        actorOrganizationId: 'org_1',
        actorIsPlatformOwner: false,
      }),
    ).rejects.toThrow(UserServiceError)
    expect(currentTx.tx.user.update).not.toHaveBeenCalled()
  })
})
