import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/nectr-social', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/nectr-social')>()
  return { ...actual, getAccounts: vi.fn(), getUsers: vi.fn(), createPost: vi.fn(), getLocation: vi.fn() }
})
vi.mock('@/db/client', () => ({
  db: { batch: { findUnique: vi.fn() }, post: { findMany: vi.fn(), update: vi.fn() } },
}))

import { scheduleBatchToNectr, buildNectrScheduleDate } from '@/server/services/nectr-schedule'
import { getAccounts, getUsers, createPost, getLocation, NectrConfigError } from '@/lib/nectr-social'
import { db } from '@/db/client'

const ACCT = (id: string, isExpired = false) => ({ id, platform: 'facebook', name: id, type: 'page', isExpired })
const USER = { id: 'svc_user', name: 'Svc', email: null, role: 'admin' }

function mockBatch(nectrLocationId: string | null) {
  vi.mocked(db.batch.findUnique).mockResolvedValue({ id: 'b1', client: { nectrLocationId } } as never)
}
function mockPosts(posts: unknown[]) {
  vi.mocked(db.post.findMany).mockResolvedValue(posts as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAccounts).mockResolvedValue([ACCT('acc_fb')])
  vi.mocked(getUsers).mockResolvedValue([USER])
  vi.mocked(getLocation).mockResolvedValue({ timezone: 'America/New_York' })
  vi.mocked(createPost).mockResolvedValue({ id: 'np_1' })
  vi.mocked(db.post.update).mockResolvedValue({} as never)
})

describe('buildNectrScheduleDate', () => {
  it('converts 8am on the post date to the UTC instant for that timezone (EDT)', () => {
    // 2026-09-01 is EDT (-04:00); 8am EDT = 12:00 UTC
    expect(buildNectrScheduleDate(new Date('2026-09-01T00:00:00Z'), 'America/New_York')).toBe('2026-09-01T12:00:00.000Z')
  })
  it('is DST-aware (EST in January)', () => {
    // 2026-01-15 is EST (-05:00); 8am EST = 13:00 UTC
    expect(buildNectrScheduleDate(new Date('2026-01-15T00:00:00Z'), 'America/New_York')).toBe('2026-01-15T13:00:00.000Z')
  })
  it('handles the Pacific spring-forward day (8am PDT)', () => {
    expect(buildNectrScheduleDate(new Date('2026-03-08T00:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-08T15:00:00.000Z')
  })
  it('handles the Pacific fall-back day (8am PST)', () => {
    expect(buildNectrScheduleDate(new Date('2026-11-01T00:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-01T16:00:00.000Z')
  })
  it('handles Mountain spring-forward (8am MDT)', () => {
    expect(buildNectrScheduleDate(new Date('2026-03-08T00:00:00Z'), 'America/Denver')).toBe('2026-03-08T14:00:00.000Z')
  })
})

describe('scheduleBatchToNectr', () => {
  it('skips when the client has no NECTR location', async () => {
    mockBatch(null)
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'no-location' })
    expect(getAccounts).not.toHaveBeenCalled()
  })

  it('skips not-configured when the token is unset', async () => {
    mockBatch('loc1')
    vi.mocked(getAccounts).mockRejectedValue(new NectrConfigError('unset'))
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'not-configured' })
  })

  it('skips no-accounts when every account is expired', async () => {
    mockBatch('loc1')
    vi.mocked(getAccounts).mockResolvedValue([ACCT('acc_fb', true)])
    expect(await scheduleBatchToNectr('b1')).toEqual({ status: 'skipped', reason: 'no-accounts' })
  })

  it('schedules each unscheduled post and persists the NECTR id', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: ['#x'], mediaUrls: ['https://b/1.png'], nectrScheduledId: null },
      { id: 'p2', postDate: new Date('2026-09-03T00:00:00Z'), caption: 'B', hashtags: [], mediaUrls: [], nectrScheduledId: null },
    ])
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'ok', scheduled: 2, alreadyScheduled: 0, accounts: 1, failed: [] })
    expect(createPost).toHaveBeenCalledWith('loc1', expect.objectContaining({
      accountIds: ['acc_fb'], summary: 'A\n\n#x', mediaUrl: 'https://b/1.png', scheduleDate: '2026-09-01T12:00:00.000Z', userId: 'svc_user',
    }), )
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { nectrScheduledId: 'np_1' } })
  })

  it('is idempotent: skips posts that already have a nectrScheduledId', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: [], mediaUrls: [], nectrScheduledId: 'existing' },
    ])
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'ok', scheduled: 0, alreadyScheduled: 1 })
    expect(createPost).not.toHaveBeenCalled()
  })

  it('returns partial when one post fails', async () => {
    mockBatch('loc1')
    mockPosts([
      { id: 'p1', postDate: new Date('2026-09-01T00:00:00Z'), caption: 'A', hashtags: [], mediaUrls: ['u'], nectrScheduledId: null },
      { id: 'p2', postDate: new Date('2026-09-02T00:00:00Z'), caption: 'B', hashtags: [], mediaUrls: ['u'], nectrScheduledId: null },
    ])
    vi.mocked(createPost).mockResolvedValueOnce({ id: 'np_1' }).mockRejectedValueOnce(new Error('boom'))
    const res = await scheduleBatchToNectr('b1')
    expect(res).toMatchObject({ status: 'partial', scheduled: 1, failed: [{ post: 'p2', reason: 'boom' }] })
  })
})
