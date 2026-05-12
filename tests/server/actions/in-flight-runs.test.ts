import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    contentRun: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    post: {
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn(),
}))

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/app/(app)/clients/[id]/generate/actions', () => ({
  triggerGeneration: vi.fn(),
}))

vi.mock('@/server/repositories/contentRuns', () => ({
  findMatchingBatchForRun: vi.fn(),
}))

import { db } from '@/db/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { triggerGeneration } from '@/app/(app)/clients/[id]/generate/actions'
import { findMatchingBatchForRun } from '@/server/repositories/contentRuns'
import {
  listInFlightRuns,
  acknowledgeFailedRunAction,
  retryFailedRunAction,
} from '@/server/actions/in-flight-runs'

const mockCtx = {
  userId: 'user_clerk_123',
  orgId: 'org_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_user_1',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

// ---- Shared fixture helper -----------------------------------------------

type RowOverrides = Partial<{
  id: string
  clientId: string
  targetMonth: string
  status: string
  brief: string | null
  crawledContent: string | null
  supportingFacts: string | null
  errorMessage: string | null
  createdAt: Date
  client: { name: string }
  _count: { posts: number }
}>

function makeRow(overrides: RowOverrides = {}) {
  return {
    id: 'run_1',
    clientId: 'client_1',
    targetMonth: '2026-05',
    status: 'running',
    brief: null,
    crawledContent: null,
    supportingFacts: null,
    errorMessage: null,
    createdAt: new Date('2026-05-12T10:00:00Z'),
    client: { name: 'Acme Corp' },
    _count: { posts: 0 },
    ...overrides,
  }
}

// ---- Test setup -----------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOrgContext).mockResolvedValue(mockCtx as never)
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx as never)
})

// ---- listInFlightRuns ----------------------------------------------------

describe('listInFlightRuns', () => {
  it('returns active runs (status not in complete or failed)', async () => {
    const now = new Date('2026-05-12T10:00:00Z')
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({
        id: 'run_1',
        clientId: 'client_1',
        targetMonth: '2026-05',
        status: 'running',
        brief: 'some brief text',
        crawledContent: null,
        supportingFacts: 'some facts',
        errorMessage: null,
        createdAt: now,
        client: { name: 'Acme Corp' },
        _count: { posts: 3 },
      }),
    ] as never)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'run_1',
      clientId: 'client_1',
      clientName: 'Acme Corp',
      targetMonth: '2026-05',
      intent: 'active',
      status: 'running',
      brief: true,
      crawledContent: false,
      supportingFacts: true,
      postCount: 3,
      errorMessage: null,
      startedAt: now.toISOString(),
    })
    expect(result[0].matchingBatch).toBeUndefined()
  })

  it('returns awaiting_choice runs (status complete with unattached posts)', async () => {
    const now = new Date('2026-05-12T11:00:00Z')
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({
        id: 'run_2',
        clientId: 'client_2',
        targetMonth: '2026-06',
        status: 'complete',
        brief: 'brief content',
        crawledContent: 'crawled stuff',
        supportingFacts: null,
        createdAt: now,
        client: { name: 'Beta LLC' },
        _count: { posts: 5 },
      }),
    ] as never)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'run_2',
      intent: 'awaiting_choice',
      status: 'complete',
      brief: true,
      crawledContent: true,
      supportingFacts: false,
      postCount: 5,
    })
    expect(result[0].matchingBatch).toBeUndefined()
  })

  it('returns failed runs only if acknowledgedAt is null', async () => {
    const t1 = new Date('2026-05-10T08:00:00Z')
    // The DB query already filters out acknowledged failed runs (WHERE clause).
    // This test verifies that only the unacknowledged one comes back from the action.
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({
        id: 'run_failed_unack',
        clientId: 'client_3',
        status: 'failed',
        errorMessage: 'OpenAI timeout',
        createdAt: t1,
        client: { name: 'Gamma Inc' },
        _count: { posts: 0 },
      }),
    ] as never)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'run_failed_unack',
      intent: 'failed',
      status: 'failed',
      errorMessage: 'OpenAI timeout',
    })

    // Verify the query included the right WHERE conditions for org scoping and failed filter
    expect(vi.mocked(db.contentRun.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client: { organizationId: mockCtx.organizationDbId },
          OR: expect.arrayContaining([
            { status: 'failed', acknowledgedAt: null },
          ]),
        }),
      }),
    )

    // The acknowledged run is not returned — the DB mock already omits it,
    // confirming the WHERE clause would filter it at the DB level.
    expect(result.find((r) => r.id === 'run_failed_ack')).toBeUndefined()
  })

  it("passes the current org's DB ID in the WHERE clause", async () => {
    // DB mock returns empty — simulating org scoping working correctly
    vi.mocked(db.contentRun.findMany).mockResolvedValue([] as never)

    await listInFlightRuns()

    // Confirm the WHERE clause scopes to the current org's DB id
    expect(vi.mocked(db.contentRun.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client: { organizationId: 'cuid_org_1' },
        }),
      }),
    )
  })

  it('orders by createdAt asc (oldest first) for stable choice-modal queueing', async () => {
    const older = new Date('2026-05-01T09:00:00Z')
    const newer = new Date('2026-05-10T09:00:00Z')

    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({ id: 'run_old', clientId: 'client_1', createdAt: older, _count: { posts: 2 } }),
      makeRow({ id: 'run_new', clientId: 'client_1', createdAt: newer, _count: { posts: 1 } }),
    ] as never)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('run_old')
    expect(result[1].id).toBe('run_new')

    // Confirm orderBy is passed correctly
    expect(vi.mocked(db.contentRun.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      }),
    )
  })
})

// ---- acknowledgeFailedRunAction ------------------------------------------

describe('acknowledgeFailedRunAction', () => {
  it('sets acknowledgedAt on the target run', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_1', status: 'failed' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'client_1' } as never)
    vi.mocked(db.contentRun.update).mockResolvedValue({} as never)

    const result = await acknowledgeFailedRunAction('r1')

    expect(result.success).toBe(true)
    expect(vi.mocked(db.contentRun.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({ acknowledgedAt: expect.any(Date) }),
      }),
    )
  })

  it('refuses to acknowledge a run from another org', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_other', status: 'failed' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue(null as never)

    await expect(acknowledgeFailedRunAction('r2')).rejects.toThrow('Run not in this org')
    expect(vi.mocked(db.contentRun.update)).not.toHaveBeenCalled()
  })

  it('refuses to acknowledge a non-failed run', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_1', status: 'running' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'client_1' } as never)

    await expect(acknowledgeFailedRunAction('r3')).rejects.toThrow(
      'Only failed runs can be acknowledged',
    )
  })
})

// ---- retryFailedRunAction ------------------------------------------------

describe('retryFailedRunAction', () => {
  it('deletes the old run and creates a fresh one with the same client + targetMonth', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_1', targetMonth: '2026-05', status: 'failed' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'client_1' } as never)
    vi.mocked(db.post.deleteMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(db.contentRun.delete).mockResolvedValue({} as never)
    vi.mocked(triggerGeneration).mockResolvedValue({ contentRunId: 'run_new_1' })

    const result = await retryFailedRunAction('run_old_1')

    expect(result.newRunId).toBe('run_new_1')
    expect(vi.mocked(db.post.deleteMany)).toHaveBeenCalledWith({
      where: { contentRunId: 'run_old_1' },
    })
    expect(vi.mocked(db.contentRun.delete)).toHaveBeenCalledWith({
      where: { id: 'run_old_1' },
    })
    expect(vi.mocked(triggerGeneration)).toHaveBeenCalledWith('client_1', '2026-05')
  })

  it('refuses to retry a run that does not exist', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(null as never)

    await expect(retryFailedRunAction('run_missing')).rejects.toThrow('Run not found')
    expect(vi.mocked(db.post.deleteMany)).not.toHaveBeenCalled()
    expect(vi.mocked(db.contentRun.delete)).not.toHaveBeenCalled()
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })

  it('refuses to retry a run from another org', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_other', targetMonth: '2026-05', status: 'failed' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue(null as never)

    await expect(retryFailedRunAction('run_other_org')).rejects.toThrow('Run not in this org')
    expect(vi.mocked(db.post.deleteMany)).not.toHaveBeenCalled()
    expect(vi.mocked(db.contentRun.delete)).not.toHaveBeenCalled()
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })

  it('refuses to retry a non-failed run', async () => {
    vi.mocked(db.contentRun.findUnique).mockResolvedValue(
      { clientId: 'client_1', targetMonth: '2026-05', status: 'running' } as never,
    )
    vi.mocked(findClientForUser).mockResolvedValue({ id: 'client_1' } as never)

    await expect(retryFailedRunAction('run_running')).rejects.toThrow(
      'Only failed runs can be retried',
    )
    expect(vi.mocked(db.post.deleteMany)).not.toHaveBeenCalled()
    expect(vi.mocked(db.contentRun.delete)).not.toHaveBeenCalled()
    expect(vi.mocked(triggerGeneration)).not.toHaveBeenCalled()
  })
})

// ---- listInFlightRuns matching-batch enrichment --------------------------

describe('listInFlightRuns matching-batch enrichment', () => {
  it('populates matchingBatch on awaiting_choice rows when a same-month batch exists', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({
        id: 'run_2',
        clientId: 'client_2',
        targetMonth: '2026-06',
        status: 'complete',
        client: { name: 'Beta LLC' },
        _count: { posts: 5 },
      }),
    ] as never)
    vi.mocked(findMatchingBatchForRun).mockResolvedValue({
      id: 'batch_1',
      label: 'June 2026',
      postCount: 8,
    })

    const result = await listInFlightRuns()

    expect(result).toHaveLength(1)
    expect(result[0].intent).toBe('awaiting_choice')
    expect(result[0].matchingBatch).toEqual({
      batchId: 'batch_1',
      label: 'June 2026',
      postCount: 8,
    })
  })

  it('leaves matchingBatch undefined when no same-month batch exists', async () => {
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      makeRow({
        id: 'run_2',
        clientId: 'client_2',
        targetMonth: '2026-06',
        status: 'complete',
        client: { name: 'Beta LLC' },
        _count: { posts: 5 },
      }),
    ] as never)
    vi.mocked(findMatchingBatchForRun).mockResolvedValue(null)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(1)
    expect(result[0].intent).toBe('awaiting_choice')
    expect(result[0].matchingBatch).toBeUndefined()
  })
})
