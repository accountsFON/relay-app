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
import { passBaton, sendBackBaton } from '@/server/services/relay'
import {
  passBatonAction,
  sendBackBatonAction,
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
