import { describe, it, expect, vi, beforeEach } from 'vitest'

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    magicLink: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>(
    '@prisma/client',
  )
  return {
    recordActivity: recordActivityMock,
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})

import { db } from '@/db/client'
import { markMagicLinkVisited } from '@/server/services/magic-link-visited-emit'

const baseInput = {
  magicLinkId: 'ml_1',
  batchId: 'batch_1',
  clientId: 'client_1',
  assignedAmUserId: 'user_am',
  defaultReviewerName: 'Sam Reviewer',
}

describe('markMagicLinkVisited', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits magic_link_visited on the first visit (CAS count === 1)', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 1 } as never)
    recordActivityMock.mockResolvedValue({ id: 'evt_1' })

    const result = await markMagicLinkVisited(baseInput)

    expect(result).toEqual({ isFirstVisit: true, emitted: true })
    expect(db.magicLink.updateMany).toHaveBeenCalledWith({
      where: { id: 'ml_1', lastVisitedAt: null },
      data: { lastVisitedAt: expect.any(Date) },
    })
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client_1',
        actorId: null,
        kind: 'magic_link_visited',
        payload: expect.objectContaining({
          magicLinkId: 'ml_1',
          batchId: 'batch_1',
          reviewerName: 'Sam Reviewer',
          isFirstVisit: true,
        }),
        mentionedUserIds: ['user_am'],
      }),
    )
  })

  it('does not emit on subsequent visits (CAS count === 0)', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(db.magicLink.update).mockResolvedValue({} as never)

    const result = await markMagicLinkVisited(baseInput)

    expect(result).toEqual({ isFirstVisit: false, emitted: false })
    expect(recordActivityMock).not.toHaveBeenCalled()
    // Still bumps lastVisitedAt so the AM's "Last visited X" indicator
    // stays accurate on returning visits.
    expect(db.magicLink.update).toHaveBeenCalledWith({
      where: { id: 'ml_1' },
      data: { lastVisitedAt: expect.any(Date) },
    })
  })

  it('skips the AM mention when no AM is assigned', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 1 } as never)
    recordActivityMock.mockResolvedValue({ id: 'evt_1' })

    await markMagicLinkVisited({ ...baseInput, assignedAmUserId: null })

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedUserIds: [],
      }),
    )
  })

  it('falls back to "A reviewer" when defaultReviewerName is null', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 1 } as never)
    recordActivityMock.mockResolvedValue({ id: 'evt_1' })

    await markMagicLinkVisited({ ...baseInput, defaultReviewerName: null })

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ reviewerName: 'A reviewer' }),
      }),
    )
  })

  it('reports emitted: false when recordActivity returns null', async () => {
    vi.mocked(db.magicLink.updateMany).mockResolvedValue({ count: 1 } as never)
    recordActivityMock.mockResolvedValue(null)

    const result = await markMagicLinkVisited(baseInput)

    expect(result).toEqual({ isFirstVisit: true, emitted: false })
  })
})
