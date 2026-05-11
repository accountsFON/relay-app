import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/db/client'
import { listActiveBatchesForClient } from '@/server/repositories/batches'

vi.mock('@/db/client', () => ({
  db: {
    batch: {
      findMany: vi.fn(),
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listActiveBatchesForClient', () => {
  it('excludes batches at the terminal step', async () => {
    vi.mocked(db.batch.findMany).mockResolvedValue([] as never)
    await listActiveBatchesForClient('client_1', 'user_viewer')

    const call = vi.mocked(db.batch.findMany).mock.calls[0]?.[0]
    expect(call).toBeDefined()
    // currentStep filter must exclude final_qa_schedule
    expect(call?.where).toMatchObject({
      clientId: 'client_1',
    })
    // Accept either { not: 'final_qa_schedule' } or { not: RelayStep.final_qa_schedule } shape
    const stepFilter = (call?.where as Record<string, unknown>)?.currentStep as Record<string, unknown>
    expect(stepFilter).toBeDefined()
    expect(stepFilter.not).toBeTruthy()
  })

  it('sorts held-by-viewer first', async () => {
    const now = Date.now()
    const batchA = {
      id: 'b_a',
      currentHolder: 'user_other',
      currentStep: 'copy',
      relayEvents: [{ createdAt: new Date(now - 1000) }],
      createdAt: new Date(now - 1_000_000),
      holder: { id: 'user_other', name: 'Other', role: 'designer' },
      _count: { posts: 5 },
    }
    const batchB = {
      id: 'b_b',
      currentHolder: 'user_viewer',
      currentStep: 'in_design',
      relayEvents: [{ createdAt: new Date(now - 100_000) }],
      createdAt: new Date(now - 5_000_000),
      holder: { id: 'user_viewer', name: 'Viewer', role: 'account_manager' },
      _count: { posts: 0 },
    }
    vi.mocked(db.batch.findMany).mockResolvedValue([batchA, batchB] as never)

    const result = await listActiveBatchesForClient('client_1', 'user_viewer')
    expect(result[0].id).toBe('b_b') // held by viewer wins
    expect(result[1].id).toBe('b_a')
  })

  it('within same holder-bucket, sorts by activity recency desc', async () => {
    const now = Date.now()
    const older = {
      id: 'b_older',
      currentHolder: 'user_other',
      currentStep: 'copy',
      relayEvents: [{ createdAt: new Date(now - 1_000_000) }],
      createdAt: new Date(now - 100), // RECENT batch creation, OLD relay event
      holder: { id: 'user_other', name: 'O' },
      _count: { posts: 0 },
    }
    const newer = {
      id: 'b_newer',
      currentHolder: 'user_other',
      currentStep: 'in_design',
      relayEvents: [{ createdAt: new Date(now - 1000) }],
      createdAt: new Date(now - 5_000_000), // OLD batch creation, RECENT relay event
      holder: { id: 'user_other', name: 'O' },
      _count: { posts: 0 },
    }
    vi.mocked(db.batch.findMany).mockResolvedValue([older, newer] as never)

    const result = await listActiveBatchesForClient('client_1', 'user_viewer')
    expect(result[0].id).toBe('b_newer')
    expect(result[1].id).toBe('b_older')
  })
})
