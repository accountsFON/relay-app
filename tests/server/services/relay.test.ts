import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ActivityKind,
  RelayEventType,
  RelayRole,
  RelayStep,
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
    'postThread.count': [],
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
    postThread: {
      // Defaults to 0 open image pins so the designer-notify branch is a no-op
      // unless a test overrides it with mockResolvedValueOnce.
      count: vi.fn(async (args: unknown) => {
        calls['postThread.count'].push([args])
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
    // advanceFromDesignReview does a guard read outside the transaction
    // (so its 'changes' path can delegate to requestDesignChanges, which
    // owns its own transaction). Route that read through the same tx mock.
    batch: {
      findUnique: vi.fn((args: unknown) => currentTx.tx.batch.findUnique(args)),
    },
  },
}))

import {
  RelayServiceError,
  advanceFromClientReview,
  advanceFromDesignReview,
  finishBatch,
  forceStep,
  getNotifyTargetsForStep,
  passBaton,
  requestDesignChanges,
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

  it('in_design -> am_review_design notifies the AM', () => {
    // Phase 3 item 15 PR1: in_design now hands directly to am_review_design;
    // the old `designs_completed` intermediate step is retired. The notify
    // target is the AM on the destination step.
    expect(getNotifyTargetsForStep(RelayStep.am_review_design, client)).toEqual([
      'user_am',
    ])
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

  it('onboarding_gate notifies the AM (pipeline rework: was admin-held, now am-held)', () => {
    // Pipeline rework changed onboarding_gate from RelayRole.admin -> RelayRole.am.
    // Admin-held steps no longer exist in the active pipeline; this test documents
    // the updated holder for onboarding_gate.
    expect(
      getNotifyTargetsForStep(RelayStep.onboarding_gate, client),
    ).toEqual(['user_am'])
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
    // merge design steps: am_qa_pre_client -> am_review_design is the surviving
    // send_back edge (was am_review_design -> design_revisions).
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u1',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.am_review_design,
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

  it('mentions every linked client user when passing to client_review', async () => {
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
      toStep: RelayStep.client_review,
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
      toStep: RelayStep.client_review,
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

  it('advances backward + reseeds + records send-back event (merge design steps: QA -> am_review_design)', async () => {
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
      toStep: RelayStep.am_review_design,
      reason: 'logo too small',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.am_review_design)
    expect(currentTx.tx.relayEvent.create.mock.calls[0][0].data.reason).toBe(
      'logo too small',
    )
    expect(currentTx.tx.checklistItem.deleteMany).toHaveBeenCalledOnce()
  })
})

describe('requestDesignChanges', () => {
  function mockBatchAt(step: RelayStep, designerId: string | null = 'user_designer') {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: step,
      label: '2026-05',
      client: { organizationId: 'org_1', assignedDesignerId: designerId },
    })
  }

  it('throws if batch not found', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce(null)
    await expect(
      requestDesignChanges({ batchId: 'b1', actorId: 'u_am', actorOrganizationId: 'org_1' }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('throws on cross-tenant access (treated as not found)', async () => {
    mockBatchAt(RelayStep.am_review_design)
    await expect(
      requestDesignChanges({ batchId: 'b1', actorId: 'u_am', actorOrganizationId: 'org_OTHER' }),
    ).rejects.toThrow(/not found/i)
  })

  it('throws unless the batch is at am_review_design', async () => {
    mockBatchAt(RelayStep.am_qa_pre_client)
    await expect(
      requestDesignChanges({ batchId: 'b1', actorId: 'u_am', actorOrganizationId: 'org_1' }),
    ).rejects.toThrow(/Design Review/)
  })

  it('sets sub-state to awaiting_design_revisions without changing step or holder', async () => {
    mockBatchAt(RelayStep.am_review_design)
    const result = await requestDesignChanges({
      batchId: 'b1',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.subState).toBe('awaiting_design_revisions')
    const update = currentTx.tx.batch.update.mock.calls[0][0]
    expect(update.data).toEqual({ currentSubState: 'awaiting_design_revisions' })
    // No step or holder change.
    expect(update.data).not.toHaveProperty('currentStep')
    expect(update.data).not.toHaveProperty('currentHolder')
  })

  it('records a design_changes_requested event mentioning the designer with internal_review payload', async () => {
    mockBatchAt(RelayStep.am_review_design, 'user_designer')
    await requestDesignChanges({
      batchId: 'b1',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const data = currentTx.tx.activityEvent.create.mock.calls[0][0].data
    expect(data.kind).toBe(ActivityKind.design_changes_requested)
    const payload = data.payload as { surface?: string; batchId?: string }
    expect(payload.surface).toBe('internal_review')
    expect(payload.batchId).toBe('b1')
    // designer is mentioned
    expect(data.mentions.create).toEqual([{ mentionedUserId: 'user_designer' }])
  })

  it('no-ops the mention if no designer is assigned but still sets sub-state', async () => {
    mockBatchAt(RelayStep.am_review_design, null)
    const result = await requestDesignChanges({
      batchId: 'b1',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.subState).toBe('awaiting_design_revisions')
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const data = currentTx.tx.activityEvent.create.mock.calls[0][0].data
    expect(data.kind).toBe(ActivityKind.design_changes_requested)
    // No mentions relation created when designer slot is empty.
    expect(data.mentions).toBeUndefined()
  })

  it('does not throw even if the activity write fails (recordActivity swallows)', async () => {
    mockBatchAt(RelayStep.am_review_design)
    currentTx.tx.activityEvent.create.mockRejectedValueOnce(new Error('db down'))
    await expect(
      requestDesignChanges({ batchId: 'b1', actorId: 'u_am', actorOrganizationId: 'org_1' }),
    ).resolves.toMatchObject({ subState: 'awaiting_design_revisions' })
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
      toStep: RelayStep.am_review_design,
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
      toStep: RelayStep.am_review_design,
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
})

describe('passBaton, no review flow', () => {
  it('forwards am_qa_pre_client to scheduling on a no review batch', async () => {
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
      toStep: RelayStep.scheduling,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.scheduling)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const batchUpdateCall = currentTx.tx.batch.update.mock.calls[0][0]
    expect(batchUpdateCall.data.currentStep).toBe(RelayStep.scheduling)
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayEventCall = currentTx.tx.relayEvent.create.mock.calls[0][0]
    expect(relayEventCall.data.type).toBe('pass_forward')
    expect(relayEventCall.data.toStep).toBe(RelayStep.scheduling)
  })

  it('rejects am_qa_pre_client to client_review on a no review batch', async () => {
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
        toStep: RelayStep.client_review,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/Illegal transition/)
  })

  it('regression: am_qa_pre_client to client_review is legal on a review enabled batch', async () => {
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
      toStep: RelayStep.client_review,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.client_review)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const batchUpdateCall = currentTx.tx.batch.update.mock.calls[0][0]
    expect(batchUpdateCall.data.currentStep).toBe(RelayStep.client_review)
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
      currentStep: RelayStep.scheduling,
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

  it('rejects if current step is not scheduling', async () => {
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
      currentStep: RelayStep.scheduling,
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
    // Phase 3 item 21 (Wave F6): completedAt is the retention anchor for
    // the auto-archive cron. Must be stamped on the terminal transition.
    expect(batchUpdateCall.data.completedAt).toBeInstanceOf(Date)

    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayEventCall = currentTx.tx.relayEvent.create.mock.calls[0][0]
    expect(relayEventCall.data.toStep).toBe(RelayStep.completed)
    expect(relayEventCall.data.fromStep).toBe(RelayStep.scheduling)
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
      currentStep: RelayStep.scheduling,
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

// ---------------------------------------------------------------------------
// forceStep: admin-only escape hatch. Moves a batch from ANY step to ANY
// other step, bypassing LEGAL_TRANSITIONS entirely. Distinct from passBaton
// (forward, gated) and sendBackBaton (backward, gated). The role check lives
// at the action layer; the service does not enforce it.
// ---------------------------------------------------------------------------

describe('advanceFromClientReview', () => {
  it('no-ops when clientReviewEnabled is false', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: false,
      label: 'Foo May 2026',
    })
    const result = await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('no-ops when the batch is not on a client-held step', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    const result = await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(result.reason).toBe('not_at_client_step')
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('no-ops when the batch does not exist (batch === null)', async () => {
    // makeTx's batch.findUnique returns null by default; no override needed.
    const result = await advanceFromClientReview({
      batchId: 'does-not-exist',
      decision: 'approved',
      reviewerName: null,
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(result.reason).toBe('not_found')
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('advanceFromClientReview approved advances client_review -> scheduling', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    const result = await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(true)
    expect(result.toStep).toBe(RelayStep.scheduling)
    expect(result.newHolderId).toBe('user_am')

    // batch.update sets the right step + holder
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.currentStep).toBe(RelayStep.scheduling)
    expect(updateData.currentHolder).toBe('user_am')

    // relayEvent is pass_forward from user_creator to user_am
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayData = currentTx.tx.relayEvent.create.mock.calls[0][0].data
    expect(relayData.type).toBe(RelayEventType.pass_forward)
    expect(relayData.fromUser).toBe('user_creator')
    expect(relayData.toUser).toBe('user_am')

    // activityEvent is client_review_decided with actorId null
    expect(currentTx.tx.activityEvent.create).toHaveBeenCalledOnce()
    const activityData = currentTx.tx.activityEvent.create.mock.calls[0][0].data
    expect(activityData.kind).toBe(ActivityKind.client_review_decided)
    expect(activityData.actorId).toBeNull()
    expect(activityData.payload.kind).toBe('client_review_decided')
    expect(activityData.payload.decision).toBe('approved')
  })

  it('advanceFromClientReview changes advances client_review -> implementing_revisions', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    const result = await advanceFromClientReview({
      batchId: 'b1',
      decision: 'changes',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(true)
    expect(result.toStep).toBe(RelayStep.implementing_revisions)
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.currentStep).toBe(RelayStep.implementing_revisions)
  })

  it('notifies the new holder AM (without actor exclusion, since actor is null)', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: null,
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    // user_am is the AM and there is no actor to exclude, so mention row is present
    expect(activityCall.data.mentions.create).toEqual([
      { mentionedUserId: 'user_am' },
    ])
  })

  it('no-ops when batch is at scheduling (not client_review), even with clientReviewEnabled', async () => {
    // Pipeline rework: old client_decision step is retired; scheduling is AM-held,
    // not client-held. A submit from a lingering client link while the AM has
    // already moved the batch is a harmless no-op.
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.scheduling,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    const result = await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(result.reason).toBe('not_at_client_step')
  })

  it('notifies the assigned designer when a changes round has image pins', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    // open image-pin count > 0
    currentTx.tx.postThread.count.mockResolvedValueOnce(3)
    await advanceFromClientReview({
      batchId: 'b1',
      decision: 'changes',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    // Two activity events: client_review_decided, then revision_images_requested.
    const calls = currentTx.tx.activityEvent.create.mock.calls
    expect(calls).toHaveLength(2)
    const designerEvent = calls[1][0].data
    expect(designerEvent.kind).toBe(ActivityKind.revision_images_requested)
    expect(designerEvent.actorId).toBeNull()
    expect(designerEvent.payload.reviewSessionId).toBe('s1')
    expect(designerEvent.payload.batchId).toBe('b1')
    expect(designerEvent.mentions.create).toEqual([
      { mentionedUserId: 'user_designer' },
    ])
    // The count query scopes to open image pins (imageX not null) on this batch.
    const countArgs = currentTx.tx.postThread.count.mock.calls[0][0]
    expect(countArgs.where.imageX).toEqual({ not: null })
    expect(countArgs.where.status).toBe('open')
    // Must exclude AM-side pins (reviewerToken null = internal pin); only client pins count.
    expect(countArgs.where.reviewerToken).toEqual({ not: null })
  })

  it('does not notify a designer when the round has no image pins', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    // open image-pin count == 0 (makeTx default), so no designer notify.
    await advanceFromClientReview({
      batchId: 'b1',
      decision: 'changes',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    const calls = currentTx.tx.activityEvent.create.mock.calls
    // Only client_review_decided; no revision_images_requested.
    expect(calls).toHaveLength(1)
    expect(calls[0][0].data.kind).toBe(ActivityKind.client_review_decided)
  })
})

describe('advanceFromDesignReview', () => {
  it('no-ops when the batch is not at am_review_design', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      label: 'Foo May 2026',
    })
    const result = await advanceFromDesignReview({
      batchId: 'b1',
      decision: 'approved',
      actorUserId: 'u_am',
      actorOrganizationId: 'org_1',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(result.reason).toBe('not_at_design_review')
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('no-ops when the batch does not exist', async () => {
    const result = await advanceFromDesignReview({
      batchId: 'missing',
      decision: 'approved',
      actorUserId: 'u_am',
      actorOrganizationId: 'org_1',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(false)
    expect(result.reason).toBe('not_found')
    expect(currentTx.tx.batch.update).not.toHaveBeenCalled()
  })

  it('all approved advances am_review_design -> am_qa_pre_client, attributed to the AM', async () => {
    // First findUnique: the guard read. Second: inside the transaction.
    currentTx.tx.batch.findUnique
      .mockResolvedValueOnce({
        id: 'b1',
        clientId: 'c1',
        currentStep: RelayStep.am_review_design,
        label: 'Foo May 2026',
      })
      .mockResolvedValueOnce({
        id: 'b1',
        clientId: 'c1',
        currentStep: RelayStep.am_review_design,
        clientReviewEnabled: false,
        label: 'Foo May 2026',
      })
    const result = await advanceFromDesignReview({
      batchId: 'b1',
      decision: 'approved',
      actorUserId: 'u_am',
      actorOrganizationId: 'org_1',
      reviewSessionId: 's1',
    })
    expect(result.advanced).toBe(true)
    expect(result.toStep).toBe(RelayStep.am_qa_pre_client)

    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.currentStep).toBe(RelayStep.am_qa_pre_client)
    // Holder resolves to the assigned AM (makeTx client default).
    expect(updateData.currentHolder).toBe('user_am')

    // relayEvent is a pass_forward attributed to the acting AM.
    expect(currentTx.tx.relayEvent.create).toHaveBeenCalledOnce()
    const relayData = currentTx.tx.relayEvent.create.mock.calls[0][0].data
    expect(relayData.type).toBe(RelayEventType.pass_forward)
    expect(relayData.fromUser).toBe('u_am')
    expect(relayData.fromStep).toBe(RelayStep.am_review_design)
    expect(relayData.toStep).toBe(RelayStep.am_qa_pre_client)
  })

  it('any changes routes through requestDesignChanges (sub-state set, no step change)', async () => {
    // First findUnique: the guard read in advanceFromDesignReview.
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      label: 'Foo May 2026',
    })
    // Second findUnique: the read inside requestDesignChanges (includes client).
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      label: 'Foo May 2026',
      client: { organizationId: 'org_1', assignedDesignerId: 'user_designer' },
    })

    const result = await advanceFromDesignReview({
      batchId: 'b1',
      decision: 'changes',
      actorUserId: 'u_am',
      actorOrganizationId: 'org_1',
      reviewSessionId: 's1',
    })

    expect(result.advanced).toBe(false)
    expect(result.subState).toBe('awaiting_design_revisions')

    // requestDesignChanges set the sub-state, did NOT change the step.
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.currentSubState).toBe('awaiting_design_revisions')
    expect(updateData.currentStep).toBeUndefined()

    // No pass_forward relay event on the changes path.
    expect(currentTx.tx.relayEvent.create).not.toHaveBeenCalled()

    // design_changes_requested activity notifies the designer.
    const activityData = currentTx.tx.activityEvent.create.mock.calls[0][0].data
    expect(activityData.kind).toBe(ActivityKind.design_changes_requested)
  })
})

describe('forceStep', () => {
  it('moves batch bypassing the legal transition table', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    const result = await forceStep({
      batchId: 'b1',
      toStep: RelayStep.copy,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(result.toStep).toBe(RelayStep.copy)
    expect(currentTx.tx.batch.update.mock.calls[0][0].data.currentStep).toBe(
      RelayStep.copy,
    )
    expect(currentTx.tx.relayEvent.create.mock.calls[0][0].data.type).toBe(
      RelayEventType.force_step,
    )
  })

  it('sets completedAt when force stepping INTO the completed step', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.final_qa_schedule,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await forceStep({
      batchId: 'b1',
      toStep: RelayStep.completed,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.completedAt).toBeInstanceOf(Date)
    expect(updateData.currentStep).toBe(RelayStep.completed)
  })

  it('rejects a no-op force step (toStep equals current step)', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      forceStep({
        batchId: 'b1',
        toStep: RelayStep.am_review_design,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/No op/)
  })

  it('rejects the retired designs_completed destination', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await expect(
      forceStep({
        batchId: 'b1',
        toStep: RelayStep.designs_completed,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/retired/)
  })

  it('clears completedAt when leaving the completed step', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.completed,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await forceStep({
      batchId: 'b1',
      toStep: RelayStep.am_review_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.completedAt).toBe(null)
    expect(updateData.currentStep).toBe(RelayStep.am_review_design)
  })

  it('does not set completedAt when not leaving the completed step', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await forceStep({
      batchId: 'b1',
      toStep: RelayStep.copy,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect('completedAt' in currentTx.tx.batch.update.mock.calls[0][0].data).toBe(
      false,
    )
  })

  it('refuses when the batch is in a different org', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_other' },
    })
    await expect(
      forceStep({
        batchId: 'b1',
        toStep: RelayStep.copy,
        actorId: 'u_am',
        actorOrganizationId: 'org_1',
      }),
    ).rejects.toThrow(/Relay not found/)
  })

  it('records a batch_force_stepped activity event with reason in payload', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u_am',
      label: '2026-05',
      client: { organizationId: 'org_1' },
    })
    await forceStep({
      batchId: 'b1',
      toStep: RelayStep.copy,
      reason: 'reset to redo brief',
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    expect(currentTx.tx.activityEvent.create).toHaveBeenCalledOnce()
    const activityData = currentTx.tx.activityEvent.create.mock.calls[0][0].data
    expect(activityData.kind).toBe(ActivityKind.batch_force_stepped)
    expect(activityData.payload.reason).toBe('reset to redo brief')
    expect(activityData.payload.fromStep).toBe(RelayStep.am_review_design)
    expect(activityData.payload.toStep).toBe(RelayStep.copy)
    expect(currentTx.tx.activityEvent.create.mock.calls[0][0].data.payload.kind).toBe('batch_force_stepped')
  })
})

// ---------------------------------------------------------------------------
// Task 12: clientReviewStartedAt stamp/clear
// Set when entering client_review, cleared (null) when leaving it or landing
// elsewhere. Applies to every service mutation that writes currentStep.
// ---------------------------------------------------------------------------

describe('clientReviewStartedAt stamp', () => {
  it('passBaton into client_review stamps clientReviewStartedAt as a Date', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
      label: 'Foo May 2026',
      clientReviewEnabled: true,
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.client_review,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.clientReviewStartedAt).toBeInstanceOf(Date)
  })

  it('advanceFromClientReview approved (client_review -> scheduling) clears clientReviewStartedAt to null', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
      label: 'Foo May 2026',
    })
    await advanceFromClientReview({
      batchId: 'b1',
      decision: 'approved',
      reviewerName: 'Sarah',
      fallbackUserId: 'user_creator',
      reviewSessionId: 's1',
    })
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.clientReviewStartedAt).toBeNull()
  })

  it('passBaton into a non-client_review step sets clientReviewStartedAt to null', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
      label: 'Foo May 2026',
      client: { organizationId: 'org_1' },
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
      actorOrganizationId: 'org_1',
    })
    const updateData = currentTx.tx.batch.update.mock.calls[0][0].data
    expect(updateData.clientReviewStartedAt).toBeNull()
  })
})
