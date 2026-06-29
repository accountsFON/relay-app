import { describe, it, expect, vi, beforeEach } from 'vitest'

const findFirst = vi.fn()
vi.mock('@/db/client', () => ({
  db: { reviewSession: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}))

import {
  findActiveClientSessionForLink,
  findLatestClientSessionForLink,
} from '@/server/repositories/reviewSessions'

describe('findActiveClientSessionForLink', () => {
  beforeEach(() => findFirst.mockReset())

  it('queries for the in_progress client session on the link, highest round first, ignoring reviewerId', async () => {
    findFirst.mockResolvedValue({ id: 's1' })
    const result = await findActiveClientSessionForLink('link_1')
    expect(result).toEqual({ id: 's1' })
    expect(findFirst).toHaveBeenCalledWith({
      where: { kind: 'client', magicLinkId: 'link_1', status: 'in_progress' },
      orderBy: [{ round: 'desc' }, { startedAt: 'desc' }],
    })
  })
})

describe('findLatestClientSessionForLink', () => {
  beforeEach(() => findFirst.mockReset())

  it('queries for the most-recent client session on the link in any status', async () => {
    findFirst.mockResolvedValue({ id: 's2', status: 'submitted' })
    const result = await findLatestClientSessionForLink('link_1')
    expect(result).toEqual({ id: 's2', status: 'submitted' })
    expect(findFirst).toHaveBeenCalledWith({
      where: { kind: 'client', magicLinkId: 'link_1' },
      orderBy: [{ round: 'desc' }, { startedAt: 'desc' }],
    })
  })
})
