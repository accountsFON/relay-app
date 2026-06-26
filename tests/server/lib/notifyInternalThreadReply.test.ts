import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    postThread: { findUnique: vi.fn() },
    postComment: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))
vi.mock('@/server/services/activity', () => ({ recordActivity: vi.fn() }))

import { db } from '@/db/client'
import { recordActivity } from '@/server/services/activity'
import { notifyInternalThreadReply } from '@/server/lib/notifyInternalThreadReply'

beforeEach(() => vi.clearAllMocks())

/**
 * Default happy-path mocks: a thread on post p1 / client c1, batch held by
 * holder1, with prior comments from author1 + author2.
 */
function mockThread(opts: {
  holderUserId?: string | null
  participantIds?: string[]
  /** ids whose role is `client` — filtered out of the bell targets. */
  clientRoleIds?: string[]
} = {}) {
  const { holderUserId = 'holder1', participantIds = ['author1', 'author2'], clientRoleIds = [] } = opts
  vi.mocked(db.postThread.findUnique).mockResolvedValue({
    postId: 'p1',
    post: {
      clientId: 'c1',
      batch: { currentHolder: holderUserId },
    },
  } as never)
  vi.mocked(db.postComment.findMany).mockResolvedValue(
    participantIds.map((id) => ({ authorId: id })) as never,
  )
  // Echo back the requested ids as internal users, minus any client-role ids
  // (mirrors `where: { id: { in }, role: { not: 'client' } }`).
  vi.mocked(db.user.findMany).mockImplementation((async (args: {
    where: { id: { in: string[] } }
  }) => {
    const ids = args.where.id.in.filter((id) => !clientRoleIds.includes(id))
    return ids.map((id) => ({ id }))
  }) as never)
}

describe('notifyInternalThreadReply', () => {
  it('records post_comment_added with participants ∪ holder ∪ mentioned minus actor, surface internal_review', async () => {
    mockThread({ holderUserId: 'holder1', participantIds: ['author1', 'author2'] })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'author1',
      mentionedUserIds: ['mention1'],
    })

    expect(recordActivity).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(recordActivity).mock.calls[0]![0]
    expect(arg.clientId).toBe('c1')
    expect(arg.postId).toBe('p1')
    expect(arg.kind).toBe('post_comment_added')
    expect((arg.payload as Record<string, unknown>).surface).toBe('internal_review')
    expect((arg.payload as Record<string, unknown>).threadId).toBe('t1')
    expect((arg.payload as Record<string, unknown>).postId).toBe('p1')
    // author1 is the actor → excluded; author2, holder1, mention1 stay.
    const targets = (arg.mentionedUserIds ?? []).slice().sort()
    expect(targets).toEqual(['author2', 'holder1', 'mention1'])
  })

  it('never targets the actor even when they hold the relay and previously commented', async () => {
    mockThread({ holderUserId: 'actor1', participantIds: ['actor1', 'other1'] })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'actor1',
      mentionedUserIds: [],
    })
    const arg = vi.mocked(recordActivity).mock.calls[0]![0]
    expect(arg.mentionedUserIds).not.toContain('actor1')
    expect(arg.mentionedUserIds).toContain('other1')
  })

  it('does NOT call recordActivity when targets are empty', async () => {
    // Only the actor is a participant + holder, no mentions → no one left.
    mockThread({ holderUserId: 'solo', participantIds: ['solo'] })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'solo',
      mentionedUserIds: [],
    })
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('dedupes targets that appear as both participant and holder', async () => {
    mockThread({ holderUserId: 'dup', participantIds: ['dup'] })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'actorX',
      mentionedUserIds: ['dup'],
    })
    const arg = vi.mocked(recordActivity).mock.calls[0]![0]
    expect((arg.mentionedUserIds ?? []).filter((id) => id === 'dup')).toHaveLength(1)
  })

  it('excludes a client-role holder (batch at client_review) and client-role participants', async () => {
    // During client_review the holder is a client-role linked user; an AM reply
    // must never write a Mention row pointing a client at an internal reply.
    mockThread({
      holderUserId: 'clientHolder',
      participantIds: ['author2', 'clientCommenter'],
      clientRoleIds: ['clientHolder', 'clientCommenter'],
    })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'author1',
      mentionedUserIds: ['mention1'],
    })
    const arg = vi.mocked(recordActivity).mock.calls[0]![0]
    const targets = (arg.mentionedUserIds ?? []).slice().sort()
    expect(targets).toEqual(['author2', 'mention1'])
    expect(arg.mentionedUserIds).not.toContain('clientHolder')
    expect(arg.mentionedUserIds).not.toContain('clientCommenter')
  })

  it('does NOT call recordActivity when every candidate is a client-role user', async () => {
    mockThread({
      holderUserId: 'clientHolder',
      participantIds: ['clientHolder'],
      clientRoleIds: ['clientHolder'],
    })
    await notifyInternalThreadReply({
      threadId: 't1',
      actorUserId: 'amActor',
      mentionedUserIds: [],
    })
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('never throws when recordActivity rejects', async () => {
    mockThread()
    vi.mocked(recordActivity).mockRejectedValue(new Error('boom'))
    await expect(
      notifyInternalThreadReply({ threadId: 't1', actorUserId: 'x', mentionedUserIds: [] }),
    ).resolves.toBeUndefined()
  })

  it('never throws and skips when the thread is missing', async () => {
    vi.mocked(db.postThread.findUnique).mockResolvedValue(null as never)
    await expect(
      notifyInternalThreadReply({ threadId: 't1', actorUserId: 'x', mentionedUserIds: [] }),
    ).resolves.toBeUndefined()
    expect(recordActivity).not.toHaveBeenCalled()
  })
})
