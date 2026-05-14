import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireCan: vi.fn(),
}))

vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
}))

vi.mock('@/server/lib/relay-state-machine', () => ({
  reseedChecklistForStep: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    batch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import {
  nudgeStuckBatchAction,
  takeOverBatchAction,
} from '@/server/actions/relay-admin'

const mockCtxOrgA = {
  userId: 'user_clerk_admin_a',
  orgId: 'org_a',
  role: 'admin' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_a',
  userDbId: 'cuid_admin_a',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

const mockCtxPlatformOwner = {
  ...mockCtxOrgA,
  userDbId: 'cuid_platform_owner',
  platformOwner: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireCan).mockResolvedValue(mockCtxOrgA)
})

describe('nudgeStuckBatchAction cross-tenant guard', () => {
  it('refuses when the batch belongs to a different organization', async () => {
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'b_other',
      clientId: 'c_other',
      currentHolder: 'someone_else',
      currentStep: 'copy',
      label: 'Their Batch',
      client: { organizationId: 'cuid_org_OTHER' },
    } as never)

    await expect(
      nudgeStuckBatchAction({ batchId: 'b_other' }),
    ).rejects.toThrow(/relay not found/i)

    // No activity event written into the victim's audit trail.
    const { recordActivity } = await import('@/server/services/activity')
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('succeeds for in-scope batches', async () => {
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'b_mine',
      clientId: 'c_mine',
      currentHolder: 'someone_in_my_org',
      currentStep: 'copy',
      label: 'My Batch',
      client: { organizationId: 'cuid_org_a' },
    } as never)

    const result = await nudgeStuckBatchAction({ batchId: 'b_mine' })

    expect(result).toEqual({ ok: true })
    const { recordActivity } = await import('@/server/services/activity')
    expect(recordActivity).toHaveBeenCalled()
  })

  it('allows platform owners to act across orgs', async () => {
    vi.mocked(requireCan).mockResolvedValue(mockCtxPlatformOwner)
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'b_other',
      clientId: 'c_other',
      currentHolder: 'someone_else',
      currentStep: 'copy',
      label: 'Their Batch',
      client: { organizationId: 'cuid_org_OTHER' },
    } as never)

    const result = await nudgeStuckBatchAction({ batchId: 'b_other' })

    expect(result).toEqual({ ok: true })
    const { recordActivity } = await import('@/server/services/activity')
    expect(recordActivity).toHaveBeenCalled()
  })
})

describe('takeOverBatchAction cross-tenant guard', () => {
  it('refuses when the batch belongs to a different organization', async () => {
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'b_other',
      clientId: 'c_other',
      currentHolder: 'someone_else',
      currentRole: 'am',
      currentStep: 'copy',
      label: 'Their Batch',
      client: { organizationId: 'cuid_org_OTHER' },
    } as never)

    await expect(
      takeOverBatchAction({ batchId: 'b_other', newHolderId: 'new_holder' }),
    ).rejects.toThrow(/relay not found/i)

    // The currentHolder must NOT have been overwritten on a foreign batch.
    expect(db.batch.update).not.toHaveBeenCalled()
  })

  it('succeeds for in-scope batches and reassigns the holder', async () => {
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      id: 'b_mine',
      clientId: 'c_mine',
      currentHolder: 'old_holder',
      currentRole: 'am',
      currentStep: 'copy',
      label: 'My Batch',
      client: { organizationId: 'cuid_org_a' },
    } as never)

    const result = await takeOverBatchAction({
      batchId: 'b_mine',
      newHolderId: 'new_holder',
    })

    expect(result).toEqual({ ok: true, changed: true })
    expect(db.batch.update).toHaveBeenCalledWith({
      where: { id: 'b_mine' },
      data: { currentHolder: 'new_holder' },
    })
  })
})
