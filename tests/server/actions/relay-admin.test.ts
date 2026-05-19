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
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    client: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    // The snapshot tests below exercise $transaction-bound code paths
    // (completeOnboardingAction, createBatchAction). The mock forwards
    // the same db object as `tx` so tx.batch.create / tx.client.update
    // hit the same vi.fn() instances asserted on below.
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const { db: dbModule } = await import('@/db/client')
      return cb(dbModule)
    }),
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
  completeOnboardingAction,
  createBatchAction,
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

describe('createBatchAction, clientReviewEnabled snapshot', () => {
  beforeEach(() => {
    // No matching batch exists yet (label is fresh).
    vi.mocked(db.batch.findFirst).mockResolvedValue(null)
    vi.mocked(db.batch.create).mockResolvedValue({ id: 'b_new' } as never)
  })

  it('snapshots clientReviewEnabled = true when the Client has it enabled', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_review_on',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: new Date('2026-05-01'),
      clientReviewEnabled: true,
    } as never)

    await createBatchAction({ clientId: 'c_review_on', label: 'Review On 2026-05' })

    const calls = vi.mocked(db.batch.create).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].data).toMatchObject({
      clientId: 'c_review_on',
      label: 'Review On 2026-05',
      clientReviewEnabled: true,
    })
  })

  it('snapshots clientReviewEnabled = false when the Client has it disabled', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_review_off',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: new Date('2026-05-01'),
      clientReviewEnabled: false,
    } as never)

    await createBatchAction({ clientId: 'c_review_off', label: 'Review Off 2026-05' })

    const calls = vi.mocked(db.batch.create).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].data).toMatchObject({
      clientId: 'c_review_off',
      label: 'Review Off 2026-05',
      clientReviewEnabled: false,
    })
  })

  it('reads clientReviewEnabled from the Client and does not depend on the column default', async () => {
    // Client lookup must include the flag in its projection; otherwise the
    // action would write `undefined` (silently falling back to Prisma's
    // column default of true). Assert both the select projection and the
    // resulting write.
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_explicit_off',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: new Date('2026-05-01'),
      clientReviewEnabled: false,
    } as never)

    await createBatchAction({
      clientId: 'c_explicit_off',
      label: 'Explicit Off 2026-05',
    })

    expect(vi.mocked(db.client.findUnique).mock.calls[0][0]).toMatchObject({
      where: { id: 'c_explicit_off' },
      select: expect.objectContaining({ clientReviewEnabled: true }),
    })
    const createCall = vi.mocked(db.batch.create).mock.calls[0][0]
    expect(createCall.data.clientReviewEnabled).toBe(false)
  })
})

describe('completeOnboardingAction, clientReviewEnabled snapshot', () => {
  beforeEach(() => {
    vi.mocked(db.batch.findFirst).mockResolvedValue(null)
    vi.mocked(db.batch.create).mockResolvedValue({ id: 'b_initial' } as never)
  })

  it('the initial batch carries the Client flag (true)', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_onb_on',
      name: 'Acme Co',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: null,
      clientReviewEnabled: true,
    } as never)

    await completeOnboardingAction({
      clientId: 'c_onb_on',
      firstBatchLabel: 'Acme Co 2026-05',
    })

    expect(vi.mocked(db.batch.create).mock.calls[0][0].data).toMatchObject({
      clientId: 'c_onb_on',
      label: 'Acme Co 2026-05',
      clientReviewEnabled: true,
    })
  })

  it('the initial batch carries the Client flag (false)', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_onb_off',
      name: 'Beta Co',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: null,
      clientReviewEnabled: false,
    } as never)

    await completeOnboardingAction({
      clientId: 'c_onb_off',
      firstBatchLabel: 'Beta Co 2026-05',
    })

    expect(vi.mocked(db.batch.create).mock.calls[0][0].data).toMatchObject({
      clientId: 'c_onb_off',
      label: 'Beta Co 2026-05',
      clientReviewEnabled: false,
    })
  })

  it('selects clientReviewEnabled from the Client', async () => {
    vi.mocked(db.client.findUnique).mockResolvedValue({
      id: 'c_onb_check_select',
      name: 'Gamma Co',
      organizationId: 'cuid_org_a',
      assignedAmId: 'cuid_admin_a',
      onboardingCompletedAt: null,
      clientReviewEnabled: false,
    } as never)

    await completeOnboardingAction({ clientId: 'c_onb_check_select' })

    expect(vi.mocked(db.client.findUnique).mock.calls[0][0]).toMatchObject({
      where: { id: 'c_onb_check_select' },
      select: expect.objectContaining({ clientReviewEnabled: true }),
    })
  })
})
