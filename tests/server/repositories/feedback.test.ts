/**
 * Unit tests for the Feedback repository (Phase 5 item 27).
 *
 * Mocks the Prisma client. Verifies findUndigested ordering / shape,
 * createFeedback passthrough, markDigested bulk update + no-op on
 * empty input, and markUrgentSent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/db/client', () => ({
  db: {
    feedback: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  createFeedback,
  findUndigested,
  markDigested,
  markUrgentSent,
  listFeedbackForAdmin,
  findFeedbackForResolve,
  setFeedbackResolved,
  reopenFeedback,
  deleteFeedback,
  deleteAllFeedback,
} from '@/server/repositories/feedback'

const mockCreate = db.feedback.create as unknown as ReturnType<typeof vi.fn>
const mockFindMany = db.feedback.findMany as unknown as ReturnType<typeof vi.fn>
const mockFindUnique = db.feedback.findUnique as unknown as ReturnType<typeof vi.fn>
const mockUpdateMany = db.feedback.updateMany as unknown as ReturnType<typeof vi.fn>
const mockUpdate = db.feedback.update as unknown as ReturnType<typeof vi.fn>
const mockDelete = db.feedback.delete as unknown as ReturnType<typeof vi.fn>
const mockDeleteMany = db.feedback.deleteMany as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createFeedback', () => {
  it('forwards the input fields to db.feedback.create', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-1',
      userId: 'u-1',
      bodyText: 'broken',
      severity: 'medium',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })

    const row = await createFeedback({
      userId: 'u-1',
      bodyText: 'broken',
      severity: 'medium',
    })

    expect(row.id).toBe('fb-1')
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        bodyText: 'broken',
        severity: 'medium',
        pageUrl: null,
        imageUrl: null,
        organizationId: null,
      },
    })
  })
})

describe('findUndigested', () => {
  it('queries undigested rows ordered ascending by createdAt and flattens submitter', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'fb-a',
        bodyText: 'first',
        severity: 'high',
        createdAt: new Date('2026-05-28T10:00:00Z'),
        sentInDigestAt: null,
        sentUrgentAt: new Date('2026-05-28T10:00:01Z'),
        user: {
          id: 'u-1',
          name: 'Julio',
          email: 'julio@fonmarketing.com',
        },
      },
      {
        id: 'fb-b',
        bodyText: 'second',
        severity: 'low',
        createdAt: new Date('2026-05-29T11:00:00Z'),
        sentInDigestAt: null,
        sentUrgentAt: null,
        user: {
          id: 'u-2',
          name: 'Mollie',
          email: 'mollie@fonmarketing.com',
        },
      },
    ])

    const rows = await findUndigested()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sentInDigestAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('fb-a')
    expect(rows[0].submitter).toEqual({
      id: 'u-1',
      name: 'Julio',
      email: 'julio@fonmarketing.com',
    })
    expect(rows[0].sentUrgentAt).toBeInstanceOf(Date)
    expect(rows[1].sentUrgentAt).toBeNull()
  })
})

describe('markDigested', () => {
  it('bulk-stamps sentInDigestAt on the provided ids', async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 })

    const at = new Date('2026-06-01T13:00:00Z')
    await markDigested({ ids: ['fb-1', 'fb-2'], at })

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['fb-1', 'fb-2'] } },
      data: { sentInDigestAt: at },
    })
  })

  it('no-ops when ids is empty', async () => {
    await markDigested({ ids: [], at: new Date() })
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})

describe('markUrgentSent', () => {
  it('stamps sentUrgentAt on a single row', async () => {
    mockUpdate.mockResolvedValue({})

    const at = new Date('2026-06-01T12:30:00Z')
    await markUrgentSent({ id: 'fb-x', at })

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'fb-x' },
      data: { sentUrgentAt: at },
    })
  })
})

describe('listFeedbackForAdmin', () => {
  it('scopes to the org for a non-platform-owner admin', async () => {
    mockFindMany.mockResolvedValue([])
    await listFeedbackForAdmin({ organizationDbId: 'org-1', platformOwner: false })

    const arg = mockFindMany.mock.calls[0][0]
    expect(arg.where).toEqual({ organizationId: 'org-1' })
    // open (unresolved) first, then newest.
    expect(arg.orderBy).toEqual([
      { resolvedAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'desc' },
    ])
  })

  it('returns ALL orgs (no where filter) for a platform owner', async () => {
    mockFindMany.mockResolvedValue([])
    await listFeedbackForAdmin({ organizationDbId: '', platformOwner: true })

    const arg = mockFindMany.mock.calls[0][0]
    expect(arg.where).toBeUndefined()
  })

  it('flattens submitter, org name, and resolver name', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'fb-1',
        bodyText: 'bug',
        severity: 'high',
        createdAt: new Date('2026-08-01T00:00:00Z'),
        pageUrl: '/clients',
        imageUrl: null,
        sentUrgentAt: new Date('2026-08-01T00:01:00Z'),
        sentInDigestAt: null,
        resolvedAt: null,
        user: { id: 'u-1', name: 'Ana', email: 'ana@x.com' },
        organization: { name: 'Acme' },
        resolvedBy: null,
      },
    ])

    const rows = await listFeedbackForAdmin({
      organizationDbId: 'org-1',
      platformOwner: false,
    })
    expect(rows[0]).toMatchObject({
      id: 'fb-1',
      pageUrl: '/clients',
      submitter: { id: 'u-1', name: 'Ana', email: 'ana@x.com' },
      organizationName: 'Acme',
      resolvedByName: null,
    })
  })
})

describe('findFeedbackForResolve', () => {
  it('selects only id + organizationId', async () => {
    mockFindUnique.mockResolvedValue({ id: 'fb-1', organizationId: 'org-1' })
    const row = await findFeedbackForResolve('fb-1')
    expect(row).toEqual({ id: 'fb-1', organizationId: 'org-1' })
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      select: { id: true, organizationId: true },
    })
  })
})

describe('setFeedbackResolved / reopenFeedback', () => {
  it('stamps resolvedAt + resolvedById', async () => {
    mockUpdate.mockResolvedValue({})
    const at = new Date('2026-08-07T00:00:00Z')
    await setFeedbackResolved({ id: 'fb-1', resolvedById: 'admin-1', at })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: { resolvedAt: at, resolvedById: 'admin-1' },
    })
  })

  it('clears resolvedAt + resolvedById on reopen', async () => {
    mockUpdate.mockResolvedValue({})
    await reopenFeedback('fb-1')
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'fb-1' },
      data: { resolvedAt: null, resolvedById: null },
    })
  })
})

describe('deleteFeedback / deleteAllFeedback', () => {
  it('hard-deletes a single row by id', async () => {
    mockDelete.mockResolvedValue({})
    await deleteFeedback('fb-1')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'fb-1' } })
  })

  it('deletes only the org’s rows for a non-platform-owner, returning the count', async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 })
    const n = await deleteAllFeedback({
      organizationDbId: 'org-1',
      platformOwner: false,
    })
    expect(n).toBe(3)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    })
  })

  it('deletes ALL rows (no where filter) for a platform owner', async () => {
    mockDeleteMany.mockResolvedValue({ count: 9 })
    const n = await deleteAllFeedback({
      organizationDbId: '',
      platformOwner: true,
    })
    expect(n).toBe(9)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: {} })
  })
})
