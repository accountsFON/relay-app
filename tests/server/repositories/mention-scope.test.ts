import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    mention: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}))

import { db } from '@/db/client'
import {
  listMentionsForUser,
  unreadMentionCount,
  mentionCountForUser,
} from '@/server/repositories/activityEvents'

describe('listMentionsForUser client scoping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges the caller-supplied clientScope into event.client (AM sees only their clients)', async () => {
    await listMentionsForUser('u1', {
      organizationId: 'org-1',
      clientScope: { assignedAmId: 'u1' },
    })
    const arg = vi.mocked(db.mention.findMany).mock.calls[0][0] as {
      where: { event: { client: Record<string, unknown> } }
    }
    expect(arg.where.event.client).toEqual({
      organizationId: 'org-1',
      assignedAmId: 'u1',
    })
  })

  it('applies only the org filter when no clientScope is given (admin/owner: all clients)', async () => {
    await listMentionsForUser('u1', { organizationId: 'org-1' })
    const arg = vi.mocked(db.mention.findMany).mock.calls[0][0] as {
      where: { event: { client: Record<string, unknown> } }
    }
    expect(arg.where.event.client).toEqual({ organizationId: 'org-1' })
  })
})

describe('unreadMentionCount client scoping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges clientScope into the count query so the badge matches the inbox', async () => {
    await unreadMentionCount('u1', 'org-1', undefined, { assignedDesignerId: 'u1' })
    const arg = vi.mocked(db.mention.count).mock.calls[0][0] as {
      where: { event: { client: Record<string, unknown> } }
    }
    expect(arg.where.event.client).toEqual({
      organizationId: 'org-1',
      assignedDesignerId: 'u1',
    })
  })
})

describe('mentionCountForUser client scoping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts the viewer-visible total (org + clientScope, all read states)', async () => {
    await mentionCountForUser('u1', 'org-1', undefined, { assignedAmId: 'u1' })
    const arg = vi.mocked(db.mention.count).mock.calls[0][0] as {
      where: { readAt?: unknown; event: { client: Record<string, unknown> } }
    }
    expect(arg.where.event.client).toEqual({
      organizationId: 'org-1',
      assignedAmId: 'u1',
    })
    // Total, not unread: must NOT constrain readAt.
    expect(arg.where.readAt).toBeUndefined()
  })
})
