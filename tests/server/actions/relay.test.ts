/**
 * Action-layer tests for passBatonAction + sendBackBatonAction.
 *
 * Focus: the holder-override gate added in feat/am-admin-holder-override.
 * AMs + admins (and platformOwner) can call these on ANY batch, regardless
 * of who holds. Designers + clients stay gated to holder.
 *
 * Service-level behavior (state machine legality, RelayEvent, payload
 * contracts) is covered by tests/server/services/relay.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { OrgContext, UserRole } from '@/lib/types'

vi.mock('@/server/middleware/permissions', () => ({
  requireCan: vi.fn(),
}))

vi.mock('@/server/services/relay', () => ({
  passBaton: vi.fn(),
  sendBackBaton: vi.fn(),
  finishBatch: vi.fn(),
  dispatchRevisions: vi.fn(),
  completeRevisionItem: vi.fn(),
  forceStep: vi.fn(),
}))

vi.mock('@/server/services/activity', () => ({
  recordActivity: vi.fn(),
}))

vi.mock('@/server/repositories/threads', () => ({
  bulkResolveOnPost: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    batch: { findUnique: vi.fn() },
    checklistItem: { findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { db } from '@/db/client'
import { requireCan } from '@/server/middleware/permissions'
import {
  passBaton,
  sendBackBaton,
  finishBatch,
  forceStep,
} from '@/server/services/relay'
import {
  passBatonAction,
  sendBackBatonAction,
  finishBatchAction,
  forceStepAction,
  tickChecklistItemAction,
} from '@/server/actions/relay'
import { RelayStep } from '@prisma/client'

function makeCtx(role: UserRole, overrides: Partial<OrgContext> = {}): OrgContext {
  return {
    userId: 'clerk_user',
    orgId: 'clerk_org',
    role,
    plan: 'agency',
    organizationDbId: 'org_1',
    userDbId: 'u_actor',
    platformOwner: false,
    linkedClientId: null,
    permissionOverrides: null,
    roleDefaults: {},
    ...overrides,
  }
}

function mockBatch(currentHolder: string, organizationId = 'org_1') {
  vi.mocked(db.batch.findUnique).mockResolvedValue({
    currentHolder,
    client: { organizationId },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(passBaton).mockResolvedValue({
    batchId: 'b1',
    toStep: RelayStep.in_design,
    newHolderId: 'u_designer',
  })
  vi.mocked(sendBackBaton).mockResolvedValue({
    batchId: 'b1',
    toStep: RelayStep.in_design,
    newHolderId: 'u_designer',
  })
  vi.mocked(finishBatch).mockResolvedValue({ batchId: 'b1' })
})

describe('passBatonAction holder gate', () => {
  it('holder (any role) can pass — wasOverride=false on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    mockBatch('u_actor') // actor IS the holder

    await passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design })

    expect(passBaton).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
        wasOverride: false,
      }),
    )
  })

  it('AM (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('account_manager'))
    mockBatch('u_someone_else')

    await passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design })

    expect(passBaton).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u_actor',
        wasOverride: true,
      }),
    )
  })

  it('admin (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    mockBatch('u_someone_else')

    await passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design })

    expect(passBaton).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('platformOwner (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('designer', { platformOwner: true }),
    )
    mockBatch('u_someone_else')

    await passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design })

    expect(passBaton).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('designer (not holder, not platformOwner) is rejected', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    mockBatch('u_someone_else')

    await expect(
      passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design }),
    ).rejects.toThrow(/only the current holder, an AM, or an admin/i)
    expect(passBaton).not.toHaveBeenCalled()
  })

  it('client (not holder) is rejected', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('client'))
    mockBatch('u_someone_else')

    await expect(
      passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design }),
    ).rejects.toThrow(/only the current holder, an AM, or an admin/i)
    expect(passBaton).not.toHaveBeenCalled()
  })

  it('cross-tenant lookup throws Relay not found', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    mockBatch('u_someone_else', 'org_OTHER')

    await expect(
      passBatonAction({ batchId: 'b1', toStep: RelayStep.in_design }),
    ).rejects.toThrow(/relay not found/i)
    expect(passBaton).not.toHaveBeenCalled()
  })
})

describe('sendBackBatonAction holder gate', () => {
  it('holder (any role) can send back — wasOverride=false on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('account_manager'))
    mockBatch('u_actor')

    await sendBackBatonAction({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      reason: 'logo too small',
    })

    expect(sendBackBaton).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'logo too small',
        wasOverride: false,
      }),
    )
  })

  it('admin (not holder) can override — wasOverride=true', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    mockBatch('u_someone_else')

    await sendBackBatonAction({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      reason: 'redo this',
    })

    expect(sendBackBaton).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('AM (not holder) can override — wasOverride=true', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('account_manager'))
    mockBatch('u_someone_else')

    await sendBackBatonAction({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      reason: 'redo this',
    })

    expect(sendBackBaton).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('designer (not holder) is rejected', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    mockBatch('u_someone_else')

    await expect(
      sendBackBatonAction({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        reason: 'because',
      }),
    ).rejects.toThrow(/only the current holder, an AM, or an admin/i)
    expect(sendBackBaton).not.toHaveBeenCalled()
  })
})

describe('finishBatchAction holder gate', () => {
  it('holder (any role) can finish — wasOverride=false on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    mockBatch('u_actor')

    await finishBatchAction({ batchId: 'b1' })

    expect(finishBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'b1',
        actorId: 'u_actor',
        actorOrganizationId: 'org_1',
        wasOverride: false,
      }),
    )
  })

  it('AM (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('account_manager'))
    mockBatch('u_someone_else')

    await finishBatchAction({ batchId: 'b1' })

    expect(finishBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u_actor',
        wasOverride: true,
      }),
    )
  })

  it('admin (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    mockBatch('u_someone_else')

    await finishBatchAction({ batchId: 'b1' })

    expect(finishBatch).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('platformOwner (not holder) can override — wasOverride=true on service call', async () => {
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('designer', { platformOwner: true }),
    )
    mockBatch('u_someone_else')

    await finishBatchAction({ batchId: 'b1' })

    expect(finishBatch).toHaveBeenCalledWith(
      expect.objectContaining({ wasOverride: true }),
    )
  })

  it('designer (not holder, not platformOwner) is rejected', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    mockBatch('u_someone_else')

    await expect(
      finishBatchAction({ batchId: 'b1' }),
    ).rejects.toThrow(/only the current holder, an AM, or an admin/i)
    expect(finishBatch).not.toHaveBeenCalled()
  })

  it('client (not holder) is rejected', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('client'))
    mockBatch('u_someone_else')

    await expect(
      finishBatchAction({ batchId: 'b1' }),
    ).rejects.toThrow(/only the current holder, an AM, or an admin/i)
    expect(finishBatch).not.toHaveBeenCalled()
  })

  it('cross-tenant lookup throws Relay not found', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    mockBatch('u_someone_else', 'org_OTHER')

    await expect(
      finishBatchAction({ batchId: 'b1' }),
    ).rejects.toThrow(/relay not found/i)
    expect(finishBatch).not.toHaveBeenCalled()
  })
})

/**
 * forceStepAction permission gate.
 *
 * Unlike pass / sendBack / finish, forceStep has NO holder-override logic.
 * The entire gate is `requireCan('relay.forceStep')`. The permission matrix
 * (Task 1) sets admin + platformOwner true and account_manager / designer /
 * client false, so AMs are DENIED here even though they override on pass.
 *
 * requireCan is mocked, so it does not enforce the matrix in these tests:
 * - happy path proves the action calls requireCan('relay.forceStep') and the
 *   service with the right args (the matrix does the real gating in prod).
 * - denial cases simulate requireCan throwing for a false-matrix role and
 *   assert the service is never reached.
 */
describe('forceStepAction permission gate', () => {
  beforeEach(() => {
    vi.mocked(forceStep).mockResolvedValue({
      batchId: 'b1',
      toStep: RelayStep.copy,
      newHolderId: 'u_am',
    })
  })

  it('admin: calls requireCan with relay.forceStep and invokes the service', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: 'c1',
      client: { organizationId: 'org_1' },
    } as never)

    const result = await forceStepAction({
      batchId: 'b1',
      toStep: RelayStep.copy,
      reason: 'redo',
    })

    expect(requireCan).toHaveBeenCalledWith('relay.forceStep')
    expect(forceStep).toHaveBeenCalledWith({
      batchId: 'b1',
      toStep: RelayStep.copy,
      reason: 'redo',
      actorId: 'u_actor',
      actorOrganizationId: 'org_1',
    })
    expect(result).toEqual({
      batchId: 'b1',
      toStep: RelayStep.copy,
      newHolderId: 'u_am',
    })
  })

  it('platform owner with a non-admin role passes the action', async () => {
    vi.mocked(requireCan).mockResolvedValue(
      makeCtx('designer', { platformOwner: true }),
    )
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: 'c1',
      client: { organizationId: 'org_1' },
    } as never)

    await expect(
      forceStepAction({ batchId: 'b1', toStep: RelayStep.copy }),
    ).resolves.toBeDefined()
    expect(forceStep).toHaveBeenCalled()
  })

  it('account_manager is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      forceStepAction({ batchId: 'b1', toStep: RelayStep.copy }),
    ).rejects.toThrow()
    expect(vi.mocked(forceStep)).not.toHaveBeenCalled()
  })

  it('designer is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      forceStepAction({ batchId: 'b1', toStep: RelayStep.copy }),
    ).rejects.toThrow()
    expect(vi.mocked(forceStep)).not.toHaveBeenCalled()
  })

  it('client is denied (requireCan throws, service not called)', async () => {
    vi.mocked(requireCan).mockRejectedValue(new Error('Forbidden'))

    await expect(
      forceStepAction({ batchId: 'b1', toStep: RelayStep.copy }),
    ).rejects.toThrow()
    expect(vi.mocked(forceStep)).not.toHaveBeenCalled()
  })

  it('cross-tenant batch id throws Relay not found (service not called)', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      clientId: 'c1',
      client: { organizationId: 'org_other' },
    } as never)

    await expect(
      forceStepAction({ batchId: 'b1', toStep: RelayStep.copy }),
    ).rejects.toThrow(/relay not found/i)
    expect(vi.mocked(forceStep)).not.toHaveBeenCalled()
  })
})

describe('tickChecklistItemAction holder-override gate', () => {
  function seedItemAndBatch(currentHolder: string) {
    vi.mocked(db.checklistItem.findUnique).mockResolvedValue({
      id: 'item1',
      batchId: 'b1',
    } as never)
    vi.mocked(db.batch.findUnique).mockResolvedValue({
      currentHolder,
      clientId: 'c1',
    } as never)
    vi.mocked(db.checklistItem.update).mockResolvedValue({} as never)
  }

  it('lets the current holder tick their own item', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    seedItemAndBatch('u_actor') // ctx.userDbId is u_actor
    const result = await tickChecklistItemAction({ itemId: 'item1', checked: true })
    expect(result).toEqual({ ok: true })
    expect(db.checklistItem.update).toHaveBeenCalled()
  })

  it('lets an admin who is NOT the holder tick (override)', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('admin'))
    seedItemAndBatch('someone_else')
    const result = await tickChecklistItemAction({ itemId: 'item1', checked: true })
    expect(result).toEqual({ ok: true })
    expect(db.checklistItem.update).toHaveBeenCalled()
  })

  it('lets an account manager who is NOT the holder tick (override)', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('account_manager'))
    seedItemAndBatch('someone_else')
    const result = await tickChecklistItemAction({ itemId: 'item1', checked: false })
    expect(result).toEqual({ ok: true })
    expect(db.checklistItem.update).toHaveBeenCalled()
  })

  it('rejects a designer who is NOT the holder', async () => {
    vi.mocked(requireCan).mockResolvedValue(makeCtx('designer'))
    seedItemAndBatch('someone_else')
    await expect(
      tickChecklistItemAction({ itemId: 'item1', checked: true }),
    ).rejects.toThrow(/current holder, an AM, or an admin/i)
    expect(db.checklistItem.update).not.toHaveBeenCalled()
  })
})
