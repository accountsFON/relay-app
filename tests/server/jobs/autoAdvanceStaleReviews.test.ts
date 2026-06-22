/**
 * Unit tests for runAutoAdvanceStaleReviews.
 *
 * Postgres free; mocks every collaborator (repo helper, relay service).
 * Covers the orchestrator logic only.
 *
 * Spec: projects/relay-app/2026-06-22-pipeline-rework-design.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Trigger.dev SDK pulls in node fetch / OTel at import time, so stub it
// inline rather than importing the real module.
vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (cfg: unknown) => cfg },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/server/repositories/batches', () => ({ findStaleClientReviews: vi.fn() }))
vi.mock('@/server/services/relay', () => ({ advanceFromClientReview: vi.fn() }))

import { runAutoAdvanceStaleReviews } from '@/server/jobs/autoAdvanceStaleReviews'
import { findStaleClientReviews } from '@/server/repositories/batches'
import { advanceFromClientReview } from '@/server/services/relay'

describe('runAutoAdvanceStaleReviews', () => {
  beforeEach(() => vi.clearAllMocks())

  it('advances each stale batch as approved', async () => {
    vi.mocked(findStaleClientReviews).mockResolvedValue([
      {
        id: 'b1',
        label: 'X',
        clientReviewStartedAt: new Date(),
        client: { id: 'c1', assignedAmId: 'am1', organization: { reviewWindowDays: 7 } },
        magicLinks: [],
      },
    ] as never)
    vi.mocked(advanceFromClientReview).mockResolvedValue({
      advanced: true,
      toStep: 'scheduling',
    } as never)

    const res = await runAutoAdvanceStaleReviews({ now: new Date('2026-06-30T00:00:00Z') })

    expect(res.advanced).toBe(1)
    expect(res.errors).toBe(0)
    expect(advanceFromClientReview).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 'b1', decision: 'approved', fallbackUserId: 'am1' }),
    )
  })

  it('skips a batch with no assigned AM and counts it as an error', async () => {
    vi.mocked(findStaleClientReviews).mockResolvedValue([
      {
        id: 'b2',
        label: 'Y',
        clientReviewStartedAt: new Date(),
        client: { id: 'c2', assignedAmId: null, organization: { reviewWindowDays: 7 } },
        magicLinks: [],
      },
    ] as never)

    const res = await runAutoAdvanceStaleReviews({ now: new Date() })

    expect(res.advanced).toBe(0)
    expect(res.errors).toBe(1)
    expect(advanceFromClientReview).not.toHaveBeenCalled()
  })

  it('counts a thrown advance as an error without aborting the loop', async () => {
    vi.mocked(findStaleClientReviews).mockResolvedValue([
      {
        id: 'b3',
        label: 'Z',
        clientReviewStartedAt: new Date(),
        client: { id: 'c3', assignedAmId: 'am3', organization: { reviewWindowDays: 7 } },
        magicLinks: [],
      },
    ] as never)
    vi.mocked(advanceFromClientReview).mockRejectedValue(new Error('boom'))

    const res = await runAutoAdvanceStaleReviews({ now: new Date() })

    expect(res.errors).toBe(1)
    expect(res.advanced).toBe(0)
  })
})
