import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))
vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))
vi.mock('@/server/repositories/threads', () => ({
  bulkResolveOnPost: vi.fn(),
}))
vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return {
    recordActivity: vi.fn(),
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db/client', () => ({
  db: { post: { findUnique: vi.fn() }, reviewItem: { findUnique: vi.fn(), update: vi.fn() } },
}))

import { db } from '@/db/client'
import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { bulkResolveOnPost } from '@/server/repositories/threads'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { markPostAddressedAction } from '@/server/actions/reviewSessions'

const ctx = { userDbId: 'am1' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(ctx as never)
  vi.mocked(findClientForUser).mockResolvedValue({ id: 'client1' } as never)
  vi.mocked(db.post.findUnique).mockResolvedValue({
    id: 'postA',
    clientId: 'client1',
    batchId: 'batch1',
  } as never)
  vi.mocked(bulkResolveOnPost).mockResolvedValue(2)
})

describe('markPostAddressedAction', () => {
  it('records the addressed event and bulk-resolves client pins when an item is present', async () => {
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: 'item1',
      postId: 'postA',
      decision: 'changes_requested',
    } as never)

    const result = await markPostAddressedAction({
      postId: 'postA',
      reviewItemId: 'item1',
      reviewSessionId: 'sess1',
    })

    expect(result).toEqual({ ok: true, pinsResolved: 2 })
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: ActivityKind.review_item_addressed,
        postId: 'postA',
        payload: expect.objectContaining({ reviewItemId: 'item1' }),
      }),
    )
    expect(bulkResolveOnPost).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'postA', onlyClientPins: true }),
    )
  })

  it('skips the addressed event when no reviewItemId (approved-but-pinned post)', async () => {
    const result = await markPostAddressedAction({
      postId: 'postA',
      reviewSessionId: 'sess1',
    })
    expect(result).toEqual({ ok: true, pinsResolved: 2 })
    expect(recordActivity).not.toHaveBeenCalled()
    expect(bulkResolveOnPost).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'postA', onlyClientPins: true }),
    )
  })

  it('throws when the review item does not belong to the post', async () => {
    vi.mocked(db.reviewItem.findUnique).mockResolvedValue({
      id: 'item1',
      postId: 'OTHER',
      decision: 'changes_requested',
    } as never)
    await expect(
      markPostAddressedAction({ postId: 'postA', reviewItemId: 'item1', reviewSessionId: 'sess1' }),
    ).rejects.toThrow(/does not belong/)
  })
})
