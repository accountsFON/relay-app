import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockRequireOrgContext = vi.fn()
const mockListMentionsForUser = vi.fn()
const mockUnreadMentionCount = vi.fn()
const mockVisibilityForViewer = vi.fn()

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: () => mockRequireOrgContext(),
}))

vi.mock('@/server/repositories/activityEvents', () => ({
  listMentionsForUser: (...args: unknown[]) => mockListMentionsForUser(...args),
  unreadMentionCount: (...args: unknown[]) => mockUnreadMentionCount(...args),
  visibilityForViewer: (...args: unknown[]) => mockVisibilityForViewer(...args),
}))

import { GET } from '@/app/api/notifications/summary/route'

describe('GET /api/notifications/summary', () => {
  beforeEach(() => {
    mockRequireOrgContext.mockReset()
    mockListMentionsForUser.mockReset()
    mockUnreadMentionCount.mockReset()
    mockVisibilityForViewer.mockReset()
    mockVisibilityForViewer.mockReturnValue(['internal', 'public'])
  })

  it('returns 200 with count + items shape', async () => {
    mockRequireOrgContext.mockResolvedValue({
      userDbId: 'u1',
      organizationDbId: 'org1',
      role: 'account_manager',
    })
    mockUnreadMentionCount.mockResolvedValue(3)
    mockListMentionsForUser.mockResolvedValue([
      {
        mentionId: 'm1',
        readAt: null,
        client: { id: 'c1', name: 'Cedar Creek' },
        event: {
          id: 'e1',
          kind: 'batch_passed',
          payload: { kind: 'batch_passed', batchLabel: 'May', batchId: 'b1' },
          createdAt: new Date('2026-05-21T12:00:00Z'),
          actor: { id: 'u2', name: 'Mollie', avatarUrl: null },
          runId: null,
        },
      },
    ])
    const req = new NextRequest('http://localhost/api/notifications/summary')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(3)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({
      eventId: 'e1',
      kind: 'batch_passed',
      summary: expect.stringContaining('Mollie passed'),
      href: '/clients/c1/batches/b1',
    })
  })

  it('caps items at 10 (passes limit: 10 to repo)', async () => {
    mockRequireOrgContext.mockResolvedValue({ userDbId: 'u1', organizationDbId: 'org1', role: 'account_manager' })
    mockUnreadMentionCount.mockResolvedValue(0)
    mockListMentionsForUser.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/notifications/summary')
    await GET(req)
    expect(mockListMentionsForUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ limit: 10, unreadOnly: true }),
    )
  })

  it('respects visibility filter from context', async () => {
    mockRequireOrgContext.mockResolvedValue({ userDbId: 'u1', organizationDbId: 'org1', role: 'designer' })
    mockUnreadMentionCount.mockResolvedValue(0)
    mockListMentionsForUser.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/notifications/summary')
    await GET(req)
    expect(mockVisibilityForViewer).toHaveBeenCalled()
    expect(mockListMentionsForUser).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ visibilityFilter: ['internal', 'public'] }),
    )
  })

  it('sets no-store cache header', async () => {
    mockRequireOrgContext.mockResolvedValue({ userDbId: 'u1', organizationDbId: 'org1', role: 'account_manager' })
    mockUnreadMentionCount.mockResolvedValue(0)
    mockListMentionsForUser.mockResolvedValue([])
    const req = new NextRequest('http://localhost/api/notifications/summary')
    const res = await GET(req)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 401 when requireOrgContext throws Unauthorized', async () => {
    mockRequireOrgContext.mockRejectedValue(new Error('Unauthorized'))
    const req = new NextRequest('http://localhost/api/notifications/summary')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })
})
