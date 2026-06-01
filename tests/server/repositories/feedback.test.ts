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
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { db } from '@/db/client'
import {
  createFeedback,
  findUndigested,
  markDigested,
  markUrgentSent,
} from '@/server/repositories/feedback'

const mockCreate = db.feedback.create as unknown as ReturnType<typeof vi.fn>
const mockFindMany = db.feedback.findMany as unknown as ReturnType<typeof vi.fn>
const mockUpdateMany = db.feedback.updateMany as unknown as ReturnType<typeof vi.fn>
const mockUpdate = db.feedback.update as unknown as ReturnType<typeof vi.fn>

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
