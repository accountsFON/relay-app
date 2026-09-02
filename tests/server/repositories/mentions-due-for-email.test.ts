import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    mention: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      updateManyAndReturn: vi.fn(),
    },
    post: { findMany: vi.fn() },
  },
}))

import { db } from '@/db/client'
import {
  anyMentionDueForEmail,
  listMentionsDueForEmail,
  claimMentionsForEmail,
  releaseMentionsForEmail,
} from '@/server/repositories/activityEvents'
import { ROLLUP_WINDOW_MS, ROLLUP_MAX_AGE_MS } from '@/lib/notification-email-rollup'

const NOW = new Date('2026-09-02T15:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('anyMentionDueForEmail', () => {
  it('is true when the probe finds a row', async () => {
    vi.mocked(db.mention.findFirst).mockResolvedValue({ id: 'm1' } as never)

    expect(await anyMentionDueForEmail(NOW)).toBe(true)
  })

  it('is false when the probe finds nothing', async () => {
    vi.mocked(db.mention.findFirst).mockResolvedValue(null as never)

    expect(await anyMentionDueForEmail(NOW)).toBe(false)
  })

  it('filters on unread, unemailed, the window and the max age', async () => {
    vi.mocked(db.mention.findFirst).mockResolvedValue(null as never)

    await anyMentionDueForEmail(NOW)

    const where = vi.mocked(db.mention.findFirst).mock.calls[0][0]!.where as never as {
      readAt: null
      emailedAt: null
      createdAt: { lte: Date; gte: Date }
    }
    expect(where.readAt).toBeNull()
    expect(where.emailedAt).toBeNull()
    expect(where.createdAt.lte).toEqual(new Date(NOW.getTime() - ROLLUP_WINDOW_MS))
    expect(where.createdAt.gte).toEqual(new Date(NOW.getTime() - ROLLUP_MAX_AGE_MS))
  })

  it('excludes client-role, deactivated and email-less recipients', async () => {
    vi.mocked(db.mention.findFirst).mockResolvedValue(null as never)

    await anyMentionDueForEmail(NOW)

    const where = vi.mocked(db.mention.findFirst).mock.calls[0][0]!.where as never as {
      user: { role: { not: string }; deactivatedAt: null; email: { not: string } }
    }
    expect(where.user.role).toEqual({ not: 'client' })
    expect(where.user.deactivatedAt).toBeNull()
    expect(where.user.email).toEqual({ not: '' })
  })

  it('excludes the three bespoke-email kinds', async () => {
    vi.mocked(db.mention.findFirst).mockResolvedValue(null as never)

    await anyMentionDueForEmail(NOW)

    const where = vi.mocked(db.mention.findFirst).mock.calls[0][0]!.where as never as {
      event: { kind: { notIn: string[] } }
    }
    expect([...where.event.kind.notIn].sort()).toEqual([
      'batch_passed',
      'batch_sent_back',
      'review_session_submitted',
    ])
  })
})

describe('listMentionsDueForEmail', () => {
  it('returns rows carrying the recipient', async () => {
    vi.mocked(db.mention.findMany).mockResolvedValue([
      {
        id: 'm1',
        readAt: null,
        user: { id: 'u1', name: 'Mollie', email: 'mollie@example.com' },
        event: {
          id: 'e1',
          clientId: 'c1',
          runId: null,
          postId: null,
          kind: 'post_comment_added',
          createdAt: NOW,
          payload: {},
          actor: { id: 'u2', name: 'Caleb', avatarUrl: null },
          client: { id: 'c1', name: 'Alpha Co' },
          post: null,
        },
      },
    ] as never)

    const rows = await listMentionsDueForEmail(NOW)

    expect(rows).toHaveLength(1)
    expect(rows[0].recipient).toEqual({
      id: 'u1',
      name: 'Mollie',
      email: 'mollie@example.com',
    })
    expect(rows[0].mentionId).toBe('m1')
    expect(rows[0].client).toEqual({ id: 'c1', name: 'Alpha Co' })
  })
})

describe('claimMentionsForEmail', () => {
  it('claims and reports winners in one atomic updateManyAndReturn call', async () => {
    vi.mocked(db.mention.updateManyAndReturn).mockResolvedValue([{ id: 'm1' }] as never)

    const claimed = await claimMentionsForEmail(['m1', 'm2'], NOW)

    expect(db.mention.updateManyAndReturn).toHaveBeenCalledTimes(1)
    const call = vi.mocked(db.mention.updateManyAndReturn).mock.calls[0][0]!
    const where = call.where as never as { id: { in: string[] }; emailedAt: null }
    expect(where.id.in).toEqual(['m1', 'm2'])
    expect(where.emailedAt).toBeNull()
    expect(call.data).toEqual({ emailedAt: NOW })
    expect(claimed).toEqual(['m1'])
  })

  it('does not fall back to a separate findMany read-back', async () => {
    vi.mocked(db.mention.updateManyAndReturn).mockResolvedValue([{ id: 'm1' }] as never)

    await claimMentionsForEmail(['m1', 'm2'], NOW)

    expect(db.mention.findMany).not.toHaveBeenCalled()
  })

  it('is a no-op on an empty list', async () => {
    expect(await claimMentionsForEmail([], NOW)).toEqual([])
    expect(db.mention.updateManyAndReturn).not.toHaveBeenCalled()
  })
})

describe('releaseMentionsForEmail', () => {
  it('clears emailedAt so a failed send retries', async () => {
    vi.mocked(db.mention.updateMany).mockResolvedValue({ count: 2 } as never)

    await releaseMentionsForEmail(['m1', 'm2'])

    const call = vi.mocked(db.mention.updateMany).mock.calls[0][0]!
    expect((call.where as never as { id: { in: string[] } }).id.in).toEqual(['m1', 'm2'])
    expect(call.data).toEqual({ emailedAt: null })
  })
})
