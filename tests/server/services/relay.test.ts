import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ActivityKind,
  RelayRole,
  RelayStep,
  RevisionItemStatus,
  RevisionItemType,
} from '@prisma/client'

type Calls = Record<string, unknown[][]>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = any

function makeTx(): { tx: AnyMock; calls: Calls } {
  const calls: Calls = {
    'batch.findUnique': [],
    'batch.update': [],
    'client.findUnique': [],
    'relayEvent.create': [],
    'activityEvent.create': [],
    'checklistItem.deleteMany': [],
    'checklistItem.createMany': [],
    'revisionPlan.deleteMany': [],
    'revisionPlan.create': [],
    'revisionItem.findUnique': [],
    'revisionItem.update': [],
    'revisionItem.count': [],
  }

  const tx = {
    batch: {
      findUnique: vi.fn(async (args: unknown) => {
        calls['batch.findUnique'].push([args])
        return null
      }),
      update: vi.fn(async (args: unknown) => {
        calls['batch.update'].push([args])
        return {}
      }),
    },
    client: {
      findUnique: vi.fn(async (args: unknown) => {
        calls['client.findUnique'].push([args])
        return {
          assignedAmId: 'user_am',
          assignedDesignerId: 'user_designer',
          linkedClientUsers: [{ id: 'user_client' }],
        }
      }),
    },
    user: {
      findUnique: vi.fn(async (args: unknown) => {
        calls['batch.findUnique'].push([args])
        const where = (args as { where?: { id?: string } } | undefined)?.where
        const id = where?.id
        const map: Record<string, string> = {
          user_am: 'AM Person',
          user_designer: 'Designer Person',
          user_client: 'Client Person',
          u_am: 'AM Acting',
          u1: 'User One',
        }
        return { name: map[id ?? ''] ?? 'Test User' }
      }),
    },
    relayEvent: {
      create: vi.fn(async (args: unknown) => {
        calls['relayEvent.create'].push([args])
        return {}
      }),
    },
    activityEvent: {
      create: vi.fn(async (args: unknown) => {
        calls['activityEvent.create'].push([args])
        return { id: 'evt_1' }
      }),
    },
    checklistItem: {
      deleteMany: vi.fn(async (args: unknown) => {
        calls['checklistItem.deleteMany'].push([args])
        return { count: 0 }
      }),
      createMany: vi.fn(async (args: unknown) => {
        calls['checklistItem.createMany'].push([args])
        return { count: 0 }
      }),
    },
    revisionPlan: {
      deleteMany: vi.fn(async (args: unknown) => {
        calls['revisionPlan.deleteMany'].push([args])
        return { count: 0 }
      }),
      create: vi.fn(async (args: unknown) => {
        calls['revisionPlan.create'].push([args])
        return {
          id: 'plan_1',
          items: [
            {
              id: 'item_1',
              type: RevisionItemType.copy,
              description: 'Tighten captions',
              assignedTo: 'user_am',
            },
            {
              id: 'item_2',
              type: RevisionItemType.design,
              description: 'Bigger logo',
              assignedTo: 'user_designer',
            },
          ],
        }
      }),
    },
    revisionItem: {
      findUnique: vi.fn(async (args: unknown) => {
        calls['revisionItem.findUnique'].push([args])
        return null
      }),
      update: vi.fn(async (args: unknown) => {
        calls['revisionItem.update'].push([args])
        return {}
      }),
      count: vi.fn(async (args: unknown) => {
        calls['revisionItem.count'].push([args])
        return 0
      }),
    },
  }

  return { tx, calls }
}

let currentTx: { tx: AnyMock; calls: Calls }

vi.mock('@/db/client', () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: AnyMock) => Promise<unknown>) =>
      fn(currentTx.tx),
    ),
  },
}))

import {
  RelayServiceError,
  completeRevisionItem,
  dispatchRevisions,
  finishBatch,
  getNotifyTargetsForStep,
  passBaton,
  sendBackBaton,
} from '@/server/services/relay'

beforeEach(() => {
  currentTx = makeTx()
})

describe('getNotifyTargetsForStep', () => {
  const client = {
    assignedAmId: 'user_am',
    assignedDesignerId: 'user_designer',
    linkedClientUsers: [{ id: 'user_client_a' }, { id: 'user_client_b' }],
  }

  it('copy -> in_design notifies the designer', () => {
    expect(getNotifyTargetsForStep(RelayStep.in_design, client)).toEqual([
      'user_designer',
    ])
  })

  it('in_design -> designs_completed stays with the designer', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.designs_completed, client),
    ).toEqual(['user_designer'])
  })

  it('am_review_design -> sent_to_client notifies every linked client user', () => {
    expect(getNotifyTargetsForStep(RelayStep.sent_to_client, client)).toEqual([
      'user_client_a',
      'user_client_b',
    ])
  })

  it('client_decision -> ready_to_schedule notifies the AM', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.ready_to_schedule, client),
    ).toEqual(['user_am'])
  })

  it('revisions_complete notifies the AM', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.revisions_complete, client),
    ).toEqual(['user_am'])
  })

  it('final_qa_schedule notifies the AM', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.final_qa_schedule, client),
    ).toEqual(['user_am'])
  })

  it('returns empty when the relevant slot is unassigned', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.in_design, {
        assignedAmId: 'user_am',
        assignedDesignerId: null,
        linkedClientUsers: [],
      }),
    ).toEqual([])
  })

  it('admin-held steps return no notify targets', () => {
    expect(
      getNotifyTargetsForStep(RelayStep.onboarding_gate, client),
    ).toEqual([])
  })
})

describe('passBaton', () => {
  it('throws if batch not found', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce(null)
    await expect(
      passBaton({ batchId: 'b1', toStep: RelayStep.in_design, actorId: 'u1', actorOrganizationId: 'org_1' }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('rejects illegal transitions', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u1',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.sent_to_client,
        actorId: 'u1',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('rejects send-back direction (caller should use sendBackBaton)', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u1',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.design_revisions,
        actorId: 'u1',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/non-forward/)
  })

  it('advances batch + emits RelayEvent + ActivityEvent + reseeds checklist', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    const result = await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.in_design)
    expect(result.newHolderId).toBe('user_designer')
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    expect(currentTx.tx.activityEvent.create).toHaveBeenCalledOnce()
    expect(currentTx.tx.checklistItem.deleteMany).toHaveBeenCalledOnce()
    expect(currentTx.tx.checklistItem.createMany).toHaveBeenCalledOnce()
  })

  it('mentions the new holder in the activity event when they differ from actor', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.mentions.create).toEqual([
      { mentionedUserId: 'user_designer' },
    ])
  })

  it('mentions every linked client user when passing to sent_to_client', async () => {
    currentTx.tx.client.findUnique.mockResolvedValueOnce({
      assignedAmId: 'user_am',
      assignedDesignerId: 'user_designer',
      linkedClientUsers: [{ id: 'user_client_a' }, { id: 'user_client_b' }],
    })
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: '2026-05',
      clientReviewEnabled: true,
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.sent_to_client,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.mentions.create).toEqual([
      { mentionedUserId: 'user_client_a' },
      { mentionedUserId: 'user_client_b' },
    ])
  })

  it('emits the activity event as public when landing on a client-facing step', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: '2026-05',
      clientReviewEnabled: true,
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.sent_to_client,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.visibility).toBe('public')
  })
})

describe('sendBackBaton', () => {
  it('requires a non-empty reason', async () => {
    await expect(
      sendBackBaton({
        batchId: 'b1',
        toStep: RelayStep.design_revisions,
        reason: '',
        actorId: 'u1',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/reason note/)
  })

  it('rejects forward direction', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u1',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      sendBackBaton({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        reason: 'because',
        actorId: 'u1',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/non-send_back/)
  })

  it('advances backward + reseeds + records send-back event', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    const result = await sendBackBaton({
      batchId: 'b1',
      toStep: RelayStep.design_revisions,
      reason: 'logo too small',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.design_revisions)
    expect(currentTx.tx.relayEvent.create.mock.calls[0][0].data.reason).toBe(
      'logo too small',
    )
    expect(currentTx.tx.checklistItem.deleteMany).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// AM / admin holder override
// ---------------------------------------------------------------------------
// passBaton + sendBackBaton accept a `wasOverride` flag that the caller
// (the action layer) sets when the actor is NOT the current holder but is
// permitted to advance anyway (AM, admin, platformOwner). The service
// writes this through to the activity payload so renderers + notification
// copy can prefix with "X overrode the holder and ...".
//
// The service itself does NOT enforce the role check — legality is still
// enforced by validateTransition, and the holder gate lives at the action
// layer (tests for that gate live alongside the action). These tests
// confirm the payload contract.

describe('passBaton wasOverride flag', () => {
  it('writes wasOverride=false into payload when omitted (back-compat)', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const payload = currentTx.tx.activityEvent.create.mock.calls[0][0].data
      .payload as { wasOverride?: boolean }
    expect(payload.wasOverride).toBe(false)
  })

  it('writes wasOverride=true into payload when caller passes it', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_designer',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
      wasOverride: true,
    })
    const payload = currentTx.tx.activityEvent.create.mock.calls[0][0].data
      .payload as { wasOverride?: boolean }
    expect(payload.wasOverride).toBe(true)
  })

  it('illegal transitions are rejected even when override=true', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_designer',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.sent_to_client, // not legal from copy
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
        wasOverride: true,
      }),
    ).rejects.toThrow(RelayServiceError)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })
})

describe('sendBackBaton wasOverride flag', () => {
  it('writes wasOverride=false into payload when omitted', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await sendBackBaton({
      batchId: 'b1',
      toStep: RelayStep.design_revisions,
      reason: 'logo too small',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const payload = currentTx.tx.activityEvent.create.mock.calls[0][0].data
      .payload as { wasOverride?: boolean }
    expect(payload.wasOverride).toBe(false)
  })

  it('writes wasOverride=true into payload when caller passes it', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_designer',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await sendBackBaton({
      batchId: 'b1',
      toStep: RelayStep.design_revisions,
      reason: 'logo too small',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
      wasOverride: true,
    })
    const payload = currentTx.tx.activityEvent.create.mock.calls[0][0].data
      .payload as { wasOverride?: boolean }
    expect(payload.wasOverride).toBe(true)
  })

  it('illegal transitions are rejected even when override=true', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_designer',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      sendBackBaton({
        batchId: 'b1',
        toStep: RelayStep.in_design, // forward, not send_back
        reason: 'because',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
        wasOverride: true,
      }),
    ).rejects.toThrow(/non-send_back/)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })
})

describe('dispatchRevisions', () => {
  it('refuses empty plans', async () => {
    await expect(
      dispatchRevisions({ batchId: 'b1', actorId: 'u1', actorOrganizationId: 'org_1', items: [] }),
    ).rejects.toThrow(/at least one/)
  })

  it('refuses if batch not at implementing_revisions', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      client: { organizationId: 'org_1' },
    })
    await expect(
      dispatchRevisions({
        batchId: 'b1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
        items: [
          {
            type: RevisionItemType.copy,
            description: 'tighten',
            assignedTo: 'u_am',
          },
        ],
      }),
    ).rejects.toThrow(/implementing_revisions/)
  })

  it('creates plan + RelayEvent + ActivityEvent per item', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.implementing_revisions,
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    const result = await dispatchRevisions({
      batchId: 'b1',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
      items: [
        {
          type: RevisionItemType.copy,
          description: 'tighten',
          assignedTo: 'u_am',
        },
        {
          type: RevisionItemType.design,
          description: 'logo',
          assignedTo: 'user_designer',
        },
      ],
    })
    expect(result.itemCount).toBe(2)
    expect(currentTx.tx.relayPlan?.create).toBeUndefined()
    expect(currentTx.tx.revisionPlan.create).toHaveBeenCalledOnce()
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledTimes(2)
    expect(currentTx.tx.activityEvent.create).toHaveBeenCalledTimes(2)
  })
})

describe('completeRevisionItem', () => {
  it('throws if item not found', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce(null)
    await expect(
      completeRevisionItem({ itemId: 'i1', actorId: 'u1', actorOrganizationId: 'org_1' }),
    ).rejects.toThrow(/not found/)
  })

  it('returns alreadyComplete=true if item is complete', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce({
      id: 'i1',
      type: RevisionItemType.copy,
      status: RevisionItemStatus.complete,
      plan: { batchId: 'b1' },
    })
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u1', actorOrganizationId: 'org_1' })
    expect(result.alreadyComplete).toBe(true)
    expect(result.autoAdvanced).toBe(false)
  })

  it('does NOT auto-advance when items remain', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce({
      id: 'i1',
      type: RevisionItemType.copy,
      status: RevisionItemStatus.pending,
      plan: { batchId: 'b1' },
    })
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.implementing_revisions,
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    currentTx.tx.revisionItem.count.mockResolvedValueOnce(1)
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u_am', actorOrganizationId: 'org_1' })
    expect(result.autoAdvanced).toBe(false)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('auto-advances 11b → 12 when last item completes', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce({
      id: 'i1',
      type: RevisionItemType.design,
      status: RevisionItemStatus.pending,
      plan: { batchId: 'b1' },
    })
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.implementing_revisions,
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    currentTx.tx.revisionItem.count.mockResolvedValueOnce(0)
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u_am', actorOrganizationId: 'org_1' })
    expect(result.autoAdvanced).toBe(true)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const updateArgs = currentTx.tx.batch.update.mock.calls[0][0]
    expect(updateArgs.data.currentStep).toBe(RelayStep.revisions_complete)
    expect(updateArgs.data.currentRole).toBe(RelayRole.am)
  })
})

// ---------------------------------------------------------------------------
// Cross-tenant scope: each service function must reject batches whose
// organization does not match the caller's `actorOrganizationId`. Treated
// as "Relay not found" to avoid existence leaks across tenants.
// ---------------------------------------------------------------------------

describe('cross-tenant scope guards', () => {
  it('passBaton refuses when the batch is in a different org', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_OTHER' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/relay not found/i)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
    expect(currentTx.tx.relayEvent.create).not.toHaveBeenCalled()
  })

  it('sendBackBaton refuses when the batch is in a different org', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_OTHER' },
    })
    await expect(
      sendBackBaton({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        reason: 'logo too small',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/relay not found/i)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('dispatchRevisions refuses when the batch is in a different org', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.implementing_revisions,
      label: '2026-05',
      client: { organizationId: 'org_OTHER' },
    })
    await expect(
      dispatchRevisions({
        batchId: 'b1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
        items: [
          {
            type: RevisionItemType.copy,
            description: 'tighten',
            assignedTo: 'u_am',
          },
        ],
      }),
    ).rejects.toThrow(/relay not found/i)
    expect(currentTx.tx.revisionPlan.create).not.toHaveBeenCalled()
  })

  it('completeRevisionItem refuses when the batch is in a different org', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce({
      id: 'i1',
      type: RevisionItemType.copy,
      status: RevisionItemStatus.pending,
      plan: { batchId: 'b1' },
    })
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.implementing_revisions,
      label: '2026-05',
      client: { organizationId: 'org_OTHER' },
    })
    await expect(
      completeRevisionItem({
        itemId: 'i1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/relay not found/i)
    // CRITICAL: the revisionItem.update must NOT have fired. The scope
    // check moves the batch lookup before the update specifically so a
    // cross-org caller cannot mutate item state before the check.
    expect(currentTx.tx.revisionItem.update).not.toHaveBeenCalled()
  })
})

describe('passBaton, no review flow', () => {
  it('forwards am_qa_pre_client to ready_to_schedule on a no review batch', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: 'Foo May 2026',
      clientReviewEnabled: false,
      client: { organizationId: 'org_1' },
    })
    const result = await passBaton({
      batchId: 'b1',
      toStep: RelayStep.ready_to_schedule,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.ready_to_schedule)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const batchUpdateCall = currentTx.tx.batch.update.mock.calls[0][0]
    expect(batchUpdateCall.data.currentStep).toBe(RelayStep.ready_to_schedule)
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayEventCall = currentTx.tx.relayEvent.create.mock.calls[0][0]
    expect(relayEventCall.data.type).toBe('pass_forward')
    expect(relayEventCall.data.toStep).toBe(RelayStep.ready_to_schedule)
  })

  it('rejects am_qa_pre_client to sent_to_client on a no review batch', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: 'Foo May 2026',
      clientReviewEnabled: false,
      client: { organizationId: 'org_1' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.sent_to_client,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/Illegal transition/)
  })

  it('regression: am_qa_pre_client to sent_to_client still legal on a review enabled batch', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: 'Foo May 2026',
      clientReviewEnabled: true,
      client: { organizationId: 'org_1' },
    })
    const result = await passBaton({
      batchId: 'b1',
      toStep: RelayStep.sent_to_client,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.sent_to_client)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const batchUpdateCall = currentTx.tx.batch.update.mock.calls[0][0]
    expect(batchUpdateCall.data.currentStep).toBe(RelayStep.sent_to_client)
  })
})

describe('finishBatch', () => {
  it('throws if batch not found', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce(null)
    await expect(
      finishBatch({
        batchId: 'b1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('rejects if batch is in another org', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.final_qa_schedule,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_OTHER' },
    })
    await expect(
      finishBatch({
        batchId: 'b1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/relay not found/i)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('rejects if current step is not final_qa_schedule', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      finishBatch({
        batchId: 'b1',
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(RelayServiceError)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('advances batch + emits RelayEvent + ActivityEvent + reseeds (empty) checklist', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.final_qa_schedule,
      currentHolder: 'u_am_prior',
      label: 'Cedar Creek May 2026',
      client: { organizationId: 'org_1' },
    })
    const result = await finishBatch({
      batchId: 'b1',
      actorId: 'u_am_now',
      actorOrganizationId: 'org_1',
    })
    expect(result.batchId).toBe('b1')
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const batchUpdateCall = currentTx.tx.batch.update.mock.calls[0][0]
    expect(batchUpdateCall.data.currentStep).toBe(RelayStep.completed)
    expect(batchUpdateCall.data.currentSubState).toBeNull()
    expect(batchUpdateCall.data.currentHolder).toBe('u_am_now')
    expect(batchUpdateCall.data.currentRole).toBe(RelayRole.am)

    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayEventCall = currentTx.tx.relayEvent.create.mock.calls[0][0]
    expect(relayEventCall.data.toStep).toBe(RelayStep.completed)
    expect(relayEventCall.data.fromStep).toBe(RelayStep.final_qa_schedule)
    expect(relayEventCall.data.fromUser).toBe('u_am_prior')
    expect(relayEventCall.data.toUser).toBe('u_am_now')

    expect(currentTx.tx.activityEvent.create).toHaveBeenCalledOnce()
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.kind).toBe(ActivityKind.batch_completed)
    expect(activityCall.data.visibility).toBe('public')
    expect(activityCall.data.payload).toMatchObject({
      batchId: 'b1',
      batchLabel: 'Cedar Creek May 2026',
      wasOverride: false,
    })

    // Checklist is reseeded to an empty list (deleteMany fires; createMany doesn't because there's nothing to seed)
    expect(currentTx.tx.checklistItem.deleteMany).toHaveBeenCalledOnce()
  })

  it('records wasOverride=true on the batch_completed payload when caller passes it', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.final_qa_schedule,
      currentHolder: 'u_someone_else',
      label: 'Cedar Creek May 2026',
      client: { organizationId: 'org_1' },
    })
    await finishBatch({
      batchId: 'b1',
      actorId: 'u_am_now',
      actorOrganizationId: 'org_1',
      wasOverride: true,
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.payload).toMatchObject({
      wasOverride: true,
    })
  })
})
