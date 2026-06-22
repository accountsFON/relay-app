/**
 * Unit tests for findStaleClientReviews (Task 13 — pipeline rework Phase 2).
 *
 * Mocks db.batch.findMany so the test exercises ONLY the JS-side filter:
 *   - window elapsed check  (elapsedMs >= days * 24 * 60 * 60 * 1000)
 *   - submitted-session guard  (no magicLink.reviewSession with status 'submitted')
 *   - null-startedAt guard  (cannot reach from the DB query, but the guard is tested)
 *
 * The `where` clause filters (currentStep, autoAdvanceOnTimeout,
 * clientReviewStartedAt: { not: null }) are enforced by Prisma at the DB layer;
 * the mock simulates that by returning only already-matching candidates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    batch: {
      findMany: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import { findStaleClientReviews } from '@/server/repositories/batches'

// Fixed "now" used across all cases.
const NOW = new Date('2026-07-01T00:00:00Z')

// Helper to build a candidate shaped exactly like the `select` in findStaleClientReviews.
function makeCandidate(overrides: {
  id: string
  label?: string
  clientReviewStartedAt: Date | null
  reviewWindowDays?: number
  assignedAmId?: string | null
  clientId?: string
  magicLinks?: Array<{ reviewSessions: Array<{ status: string }> }>
}) {
  return {
    id: overrides.id,
    label: overrides.label ?? `Batch ${overrides.id}`,
    clientReviewStartedAt: overrides.clientReviewStartedAt,
    client: {
      id: overrides.clientId ?? `client-${overrides.id}`,
      assignedAmId: overrides.assignedAmId ?? null,
      organization: {
        reviewWindowDays: overrides.reviewWindowDays ?? 7,
      },
    },
    magicLinks: overrides.magicLinks ?? [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('findStaleClientReviews', () => {
  it('includes a batch started 8 days ago with no submitted session', async () => {
    const startedAt = new Date('2026-06-23T00:00:00Z') // 8 days before NOW
    const candidate = makeCandidate({
      id: 'batch-included',
      clientReviewStartedAt: startedAt,
      reviewWindowDays: 7,
      magicLinks: [{ reviewSessions: [{ status: 'pending' }] }],
    })

    vi.mocked(db.batch.findMany).mockResolvedValue([candidate] as never)

    const result = await findStaleClientReviews(NOW)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('batch-included')
  })

  it('excludes a batch started only 3 days ago (within the window)', async () => {
    const startedAt = new Date('2026-06-28T00:00:00Z') // 3 days before NOW
    const candidate = makeCandidate({
      id: 'batch-too-fresh',
      clientReviewStartedAt: startedAt,
      reviewWindowDays: 7,
    })

    vi.mocked(db.batch.findMany).mockResolvedValue([candidate] as never)

    const result = await findStaleClientReviews(NOW)

    expect(result).toHaveLength(0)
  })

  it('excludes a batch started 8 days ago when a magic link has a submitted review session', async () => {
    const startedAt = new Date('2026-06-23T00:00:00Z') // 8 days before NOW
    const candidate = makeCandidate({
      id: 'batch-client-responded',
      clientReviewStartedAt: startedAt,
      reviewWindowDays: 7,
      magicLinks: [
        {
          reviewSessions: [
            { status: 'pending' },
            { status: 'submitted' }, // client submitted — must exclude
          ],
        },
      ],
    })

    vi.mocked(db.batch.findMany).mockResolvedValue([candidate] as never)

    const result = await findStaleClientReviews(NOW)

    expect(result).toHaveLength(0)
  })

  it('excludes a batch with null clientReviewStartedAt (null guard)', async () => {
    // The DB where clause already prevents this from reaching the JS filter,
    // but the guard is tested here for defence in depth.
    const candidate = makeCandidate({
      id: 'batch-no-start',
      clientReviewStartedAt: null,
      reviewWindowDays: 7,
    })

    vi.mocked(db.batch.findMany).mockResolvedValue([candidate] as never)

    const result = await findStaleClientReviews(NOW)

    expect(result).toHaveLength(0)
  })

  it('returns only the eligible batch when multiple candidates are present', async () => {
    const staleStartedAt = new Date('2026-06-23T00:00:00Z')  // 8 days — stale
    const freshStartedAt = new Date('2026-06-28T00:00:00Z')  // 3 days — fresh

    const stale = makeCandidate({
      id: 'batch-stale',
      clientReviewStartedAt: staleStartedAt,
      reviewWindowDays: 7,
      magicLinks: [{ reviewSessions: [] }],
    })
    const fresh = makeCandidate({
      id: 'batch-fresh',
      clientReviewStartedAt: freshStartedAt,
      reviewWindowDays: 7,
    })
    const responded = makeCandidate({
      id: 'batch-responded',
      clientReviewStartedAt: staleStartedAt,
      reviewWindowDays: 7,
      magicLinks: [{ reviewSessions: [{ status: 'submitted' }] }],
    })
    const nullStart = makeCandidate({
      id: 'batch-null',
      clientReviewStartedAt: null,
      reviewWindowDays: 7,
    })

    vi.mocked(db.batch.findMany).mockResolvedValue(
      [stale, fresh, responded, nullStart] as never,
    )

    const result = await findStaleClientReviews(NOW)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('batch-stale')
  })

  it('passes the correct where clause to db.batch.findMany', async () => {
    vi.mocked(db.batch.findMany).mockResolvedValue([] as never)

    await findStaleClientReviews(NOW)

    expect(vi.mocked(db.batch.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          autoAdvanceOnTimeout: true,
          clientReviewStartedAt: { not: null },
        }),
      }),
    )
  })
})
