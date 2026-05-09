import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
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
  passBaton,
  sendBackBaton,
} from '@/server/services/relay'

beforeEach(() => {
  currentTx = makeTx()
})

describe('passBaton', () => {
  it('throws if batch not found', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce(null)
    await expect(
      passBaton({ batchId: 'b1', toStep: RelayStep.in_design, actorId: 'u1' }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('rejects illegal transitions', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u1',
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.sent_to_client,
        actorId: 'u1',
      }),
    ).rejects.toThrow(RelayServiceError)
  })

  it('rejects send-back direction (caller should use sendBackBaton)', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_review_design,
      currentHolder: 'u1',
    })
    await expect(
      passBaton({
        batchId: 'b1',
        toStep: RelayStep.design_revisions,
        actorId: 'u1',
      }),
    ).rejects.toThrow(/non-forward/)
  })

  it('advances batch + emits RelayEvent + ActivityEvent + reseeds checklist', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u_am',
    })
    const result = await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
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
    })
    await passBaton({
      batchId: 'b1',
      toStep: RelayStep.in_design,
      actorId: 'u_am',
    })
    const activityCall = currentTx.tx.activityEvent.create.mock.calls[0][0]
    expect(activityCall.data.mentions.create).toEqual([
      { mentionedUserId: 'user_designer' },
    ])
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
      }),
    ).rejects.toThrow(/reason note/)
  })

  it('rejects forward direction', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
      currentHolder: 'u1',
    })
    await expect(
      sendBackBaton({
        batchId: 'b1',
        toStep: RelayStep.in_design,
        reason: 'because',
        actorId: 'u1',
      }),
    ).rejects.toThrow(/non-send_back/)
  })

  it('advances backward + reseeds + records send-back event', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.am_qa_pre_client,
      currentHolder: 'u_am',
    })
    const result = await sendBackBaton({
      batchId: 'b1',
      toStep: RelayStep.design_revisions,
      reason: 'logo too small',
      actorId: 'u_am',
    })
    expect(result.toStep).toBe(RelayStep.design_revisions)
    expect(currentTx.tx.relayEvent.create.mock.calls[0][0].data.reason).toBe(
      'logo too small',
    )
    expect(currentTx.tx.checklistItem.deleteMany).toHaveBeenCalledOnce()
  })
})

describe('dispatchRevisions', () => {
  it('refuses empty plans', async () => {
    await expect(
      dispatchRevisions({ batchId: 'b1', actorId: 'u1', items: [] }),
    ).rejects.toThrow(/at least one/)
  })

  it('refuses if batch not at implementing_revisions', async () => {
    currentTx.tx.batch.findUnique.mockResolvedValueOnce({
      id: 'b1',
      clientId: 'c1',
      currentStep: RelayStep.copy,
    })
    await expect(
      dispatchRevisions({
        batchId: 'b1',
        actorId: 'u_am',
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
    })
    const result = await dispatchRevisions({
      batchId: 'b1',
      actorId: 'u_am',
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
      completeRevisionItem({ itemId: 'i1', actorId: 'u1' }),
    ).rejects.toThrow(/not found/)
  })

  it('returns alreadyComplete=true if item is complete', async () => {
    currentTx.tx.revisionItem.findUnique.mockResolvedValueOnce({
      id: 'i1',
      type: RevisionItemType.copy,
      status: RevisionItemStatus.complete,
      plan: { batchId: 'b1' },
    })
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u1' })
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
    })
    currentTx.tx.revisionItem.count.mockResolvedValueOnce(1)
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u_am' })
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
    })
    currentTx.tx.revisionItem.count.mockResolvedValueOnce(0)
    const result = await completeRevisionItem({ itemId: 'i1', actorId: 'u_am' })
    expect(result.autoAdvanced).toBe(true)
    expect(currentTx.tx.batch.update).toHaveBeenCalledOnce()
    const updateArgs = currentTx.tx.batch.update.mock.calls[0][0]
    expect(updateArgs.data.currentStep).toBe(RelayStep.revisions_complete)
    expect(updateArgs.data.currentRole).toBe(RelayRole.am)
  })
})
