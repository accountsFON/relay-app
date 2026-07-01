// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({ requireClientEditor: vi.fn() }))
vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
  updateClient: vi.fn(),
}))
vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return { recordActivity: vi.fn(), ActivityKind: actual.ActivityKind }
})
vi.mock('@/db/client', () => ({
  db: {
    client: { update: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { recordActivity } from '@/server/services/activity'
import { db } from '@/db/client'
import { ActivityKind } from '@prisma/client'
import {
  setClientOnboardingItemAction,
  completeClientOnboardingAction,
} from '@/app/(app)/clients/actions'

const ctx = { organizationDbId: 'org1', userDbId: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(ctx as never)
})

// ---------------------------------------------------------------------------
// setClientOnboardingItemAction
// ---------------------------------------------------------------------------

describe('setClientOnboardingItemAction', () => {
  it('updates the boolean field when client exists and onboarding is not yet complete', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'c1',
      onboardingCompletedAt: null,
      onboardingAccountFilledOut: false,
    } as never)

    await setClientOnboardingItemAction('c1', 'account', true)

    expect(db.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { onboardingAccountFilledOut: true },
    })
  })

  it('is inert when onboardingCompletedAt is already set', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'c1',
      onboardingCompletedAt: new Date(),
      onboardingAccountFilledOut: true,
    } as never)

    await setClientOnboardingItemAction('c1', 'account', false)

    expect(db.client.update).not.toHaveBeenCalled()
  })

  it('is inert when findClientForUser returns null (out of scope)', async () => {
    vi.mocked(findClientForUser).mockResolvedValue(null)

    await setClientOnboardingItemAction('c1', 'account', true)

    expect(db.client.update).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// completeClientOnboardingAction
// ---------------------------------------------------------------------------

describe('completeClientOnboardingAction', () => {
  it('sets onboardingCompletedAt and records activity when all three items are checked', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'c1',
      onboardingCompletedAt: null,
      onboardingAccountFilledOut: true,
      onboardingDesignFolderReady: true,
      onboardingAssetsReceived: true,
    } as never)

    await completeClientOnboardingAction('c1')

    expect(db.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { onboardingCompletedAt: expect.any(Date) },
    })
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ActivityKind.client_onboarding_completed,
        clientId: 'c1',
        actorId: 'u1',
      }),
    )
  })

  it('throws and does not update when not all three items are checked', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'c1',
      onboardingCompletedAt: null,
      onboardingAccountFilledOut: true,
      onboardingDesignFolderReady: false,
      onboardingAssetsReceived: true,
    } as never)

    await expect(completeClientOnboardingAction('c1')).rejects.toThrow()

    expect(db.client.update).not.toHaveBeenCalled()
  })

  it('is inert when onboardingCompletedAt is already set', async () => {
    vi.mocked(findClientForUser).mockResolvedValue({
      id: 'c1',
      onboardingCompletedAt: new Date(),
      onboardingAccountFilledOut: true,
      onboardingDesignFolderReady: true,
      onboardingAssetsReceived: true,
    } as never)

    await completeClientOnboardingAction('c1')

    expect(db.client.update).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })
})
