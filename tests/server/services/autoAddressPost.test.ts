import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    reviewItem: { findFirst: vi.fn(), update: vi.fn() },
    postThread: { findMany: vi.fn() },
  },
}))

import { maybeAutoAddressPost } from '@/server/services/autoAddressPost'
import { db } from '@/db/client'

/**
 * Server-side auto-address roll-up.
 *
 * Why it exists (Julio, 2026-08-31): the roll-up used to live ONLY in the
 * review rail's click handler, so it fired only when the AM resolved a thread
 * through that one screen. The designer resolves the very same client threads
 * from the batch preview page (a different surface calling resolveThreadAction
 * directly), and that path never touched addressedAt. Result: the designer said
 * "I marked everything resolved", the threads really were resolved, and every
 * "Mark addressed" button was still sitting there unpressed.
 *
 * Putting the roll-up behind the resolve WRITE means it fires from any surface.
 */
const ITEM = {
  id: 'ri-1',
  postId: 'p1',
  decision: 'changes_requested',
  comment: null as string | null,
  noteResolvedAt: null as Date | null,
  addressedAt: null as Date | null,
  acceptedAsPostVersionId: null as string | null,
}

function mockItem(over: Partial<typeof ITEM> = {}) {
  vi.mocked(db.reviewItem.findFirst).mockResolvedValue({ ...ITEM, ...over } as never)
}
/** Client threads still OPEN on the post, plus whether a post-level one exists. */
function mockThreads(rows: { status: string; isPostLevel: boolean }[]) {
  vi.mocked(db.postThread.findMany).mockResolvedValue(
    rows.map((r, i) => ({
      id: `t${i}`,
      status: r.status,
      imageX: r.isPostLevel ? null : 10,
      imageY: r.isPostLevel ? null : 20,
      captionFrom: null,
      captionTo: null,
    })) as never,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.reviewItem.update).mockResolvedValue({} as never)
})

describe('maybeAutoAddressPost', () => {
  it('addresses the post once every client thread is resolved', async () => {
    mockItem()
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    const res = await maybeAutoAddressPost('p1', 'u_am')

    expect(res).toBe('addressed')
    expect(db.reviewItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ri-1' },
        data: expect.objectContaining({ addressedBy: 'u_am' }),
      }),
    )
  })

  it('holds off while any client thread is still open', async () => {
    mockItem()
    mockThreads([
      { status: 'resolved', isPostLevel: false },
      { status: 'open', isPostLevel: false },
    ])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('not-ready')
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('holds off when a standalone client note is still unresolved', async () => {
    // No post-level thread, so the note is its own item and must be ticked.
    mockItem({ comment: 'please soften the headline' })
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('not-ready')
  })

  it('treats the note as covered when a post-level thread carries it', async () => {
    // Same trap the client-side roll-up hit: once anyone replies to a general
    // note it becomes a post-level thread and no separate note tick exists.
    mockItem({ comment: 'please soften the headline' })
    mockThreads([
      { status: 'resolved', isPostLevel: false },
      { status: 'resolved', isPostLevel: true },
    ])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('addressed')
  })

  it('resolves the note alongside the post so both halves agree', async () => {
    mockItem({ comment: 'please soften', noteResolvedAt: null })
    mockThreads([
      { status: 'resolved', isPostLevel: false },
      { status: 'resolved', isPostLevel: true },
    ])

    await maybeAutoAddressPost('p1', 'u_am')

    const data = vi.mocked(db.reviewItem.update).mock.calls[0][0].data as Record<string, unknown>
    expect(data.noteResolvedAt).toBeInstanceOf(Date)
    expect(data.noteResolvedBy).toBe('u_am')
  })

  it('holds off on an unaccepted caption edit', async () => {
    mockItem({ decision: 'caption_edited', acceptedAsPostVersionId: null })
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('not-ready')
  })

  it('addresses a caption edit once it has been accepted', async () => {
    mockItem({ decision: 'caption_edited', acceptedAsPostVersionId: 'pv-9' })
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('addressed')
  })

  it('does nothing for a post with no review item', async () => {
    vi.mocked(db.reviewItem.findFirst).mockResolvedValue(null as never)

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('no-item')
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('does nothing for an approved post (nothing was ever requested)', async () => {
    mockItem({ decision: 'approved' })
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('no-item')
  })

  it('is idempotent once the post is already addressed', async () => {
    mockItem({ addressedAt: new Date('2026-08-30') })
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    expect(await maybeAutoAddressPost('p1', 'u_am')).toBe('already')
    expect(db.reviewItem.update).not.toHaveBeenCalled()
  })

  it('only counts CLIENT threads, so an internal AM pin cannot block it', async () => {
    mockItem()
    mockThreads([{ status: 'resolved', isPostLevel: false }])

    await maybeAutoAddressPost('p1', 'u_am')

    const where = vi.mocked(db.postThread.findMany).mock.calls[0][0]?.where as Record<string, unknown>
    expect(where.reviewerToken).toEqual({ not: null })
  })
})
