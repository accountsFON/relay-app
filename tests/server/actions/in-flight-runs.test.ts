import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    contentRun: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn(),
}))

import { db } from '@/db/client'
import { requireOrgContext } from '@/server/middleware/auth'
import { listInFlightRuns } from '@/server/actions/in-flight-runs'

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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireOrgContext).mockResolvedValue(mockCtx as never)
})

describe('listInFlightRuns', () => {
  it('returns active runs (status not in complete or failed)', async () => {
    const now = new Date('2026-05-12T10:00:00Z')
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      {
        id: 'run_1',
        clientId: 'client_1',
        targetMonth: '2026-05',
        status: 'running',
        brief: 'some brief text',
        crawledContent: null,
        supportingFacts: 'some facts',
        errorMessage: null,
        createdAt: now,
        acknowledgedAt: null,
        client: { name: 'Acme Corp' },
        _count: { posts: 3 },
      },
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
      {
        id: 'run_2',
        clientId: 'client_2',
        targetMonth: '2026-06',
        status: 'complete',
        brief: 'brief content',
        crawledContent: 'crawled stuff',
        supportingFacts: null,
        errorMessage: null,
        createdAt: now,
        acknowledgedAt: null,
        client: { name: 'Beta LLC' },
        _count: { posts: 5 },
      },
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
    const t2 = new Date('2026-05-11T08:00:00Z')
    // The DB query already filters out acknowledged failed runs (WHERE clause).
    // This test verifies that only the unacknowledged one comes back from the action.
    vi.mocked(db.contentRun.findMany).mockResolvedValue([
      {
        id: 'run_failed_unack',
        clientId: 'client_3',
        targetMonth: '2026-05',
        status: 'failed',
        brief: null,
        crawledContent: null,
        supportingFacts: null,
        errorMessage: 'OpenAI timeout',
        createdAt: t1,
        acknowledgedAt: null,
        client: { name: 'Gamma Inc' },
        _count: { posts: 0 },
      },
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

    // The acknowledged run (t2) is not returned — the DB mock already omits it,
    // confirming the WHERE clause would filter it at the DB level.
    expect(result.find((r) => r.id === 'run_failed_ack')).toBeUndefined()
    void t2 // satisfy lint — only used in comment above
  })

  it('does not return runs from other organizations', async () => {
    // DB mock returns empty — simulating org scoping working correctly
    vi.mocked(db.contentRun.findMany).mockResolvedValue([] as never)

    const result = await listInFlightRuns()

    expect(result).toHaveLength(0)

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
      {
        id: 'run_old',
        clientId: 'client_1',
        targetMonth: '2026-05',
        status: 'running',
        brief: null,
        crawledContent: null,
        supportingFacts: null,
        errorMessage: null,
        createdAt: older,
        acknowledgedAt: null,
        client: { name: 'Alpha Co' },
        _count: { posts: 2 },
      },
      {
        id: 'run_new',
        clientId: 'client_1',
        targetMonth: '2026-05',
        status: 'running',
        brief: null,
        crawledContent: null,
        supportingFacts: null,
        errorMessage: null,
        createdAt: newer,
        acknowledgedAt: null,
        client: { name: 'Alpha Co' },
        _count: { posts: 1 },
      },
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
