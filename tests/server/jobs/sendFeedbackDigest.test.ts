/**
 * Unit tests for runSendFeedbackDigest (Phase 5 item 27 weekly cron).
 *
 * Postgres-free; mocks the feedback repo, the users repo, and the
 * Resend wrapper. Covers: empty short-circuit, empty admin recipients
 * short-circuit, per-recipient send, severity ordering passthrough,
 * markDigested stamp on success, partial failure still stamps so the
 * cron does not loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/repositories/feedback', () => ({
  findUndigested: vi.fn(),
  markDigested: vi.fn(),
}))
vi.mock('@/server/repositories/users', () => ({
  findAdminRecipients: vi.fn(),
}))
vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (cfg: unknown) => cfg },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { runSendFeedbackDigest } from '@/server/jobs/sendFeedbackDigest'
import { findUndigested, markDigested } from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { sendEmail } from '@/lib/resend'

const mockFind = findUndigested as unknown as ReturnType<typeof vi.fn>
const mockMark = markDigested as unknown as ReturnType<typeof vi.fn>
const mockAdmins = findAdminRecipients as unknown as ReturnType<typeof vi.fn>
const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>

const NOW = new Date('2026-06-01T13:00:00Z')

function makeRow(over: Partial<{
  id: string
  severity: 'low' | 'medium' | 'high'
  bodyText: string
  createdAt: Date
  submitter: { id: string; name: string; email: string }
}> = {}) {
  return {
    id: over.id ?? 'fb-1',
    bodyText: over.bodyText ?? 'something broke',
    severity: over.severity ?? 'medium',
    createdAt: over.createdAt ?? new Date('2026-05-30T10:00:00Z'),
    sentInDigestAt: null,
    sentUrgentAt: null,
    submitter: over.submitter ?? {
      id: 'u-1',
      name: 'Julio Aleman',
      email: 'julio@fonmarketing.com',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runSendFeedbackDigest', () => {
  it('returns zeros + skips send when no undigested feedback', async () => {
    mockFind.mockResolvedValue([])

    const result = await runSendFeedbackDigest({ now: NOW })

    expect(result).toEqual({
      itemsIncluded: 0,
      recipientsEmailed: 0,
      errors: 0,
    })
    expect(mockAdmins).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockMark).not.toHaveBeenCalled()
  })

  it('skips send when admin recipients list is empty', async () => {
    mockFind.mockResolvedValue([makeRow()])
    mockAdmins.mockResolvedValue([])

    const result = await runSendFeedbackDigest({ now: NOW })

    expect(result).toEqual({
      itemsIncluded: 0,
      recipientsEmailed: 0,
      errors: 0,
    })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockMark).not.toHaveBeenCalled()
  })

  it('sends one email per admin + stamps every included row on success', async () => {
    const rows = [
      makeRow({ id: 'fb-a', severity: 'high' }),
      makeRow({ id: 'fb-b', severity: 'low' }),
      makeRow({ id: 'fb-c', severity: 'medium' }),
    ]
    mockFind.mockResolvedValue(rows)
    mockAdmins.mockResolvedValue([
      { id: 'u-julio', name: 'Julio', email: 'julio@fonmarketing.com' },
      { id: 'u-mollie', name: 'Mollie', email: 'mollie@fonmarketing.com' },
      { id: 'u-caleb', name: 'Caleb', email: 'caleb@fonmarketing.com' },
    ])
    mockSend.mockResolvedValue({ id: 'resend-x' })

    const result = await runSendFeedbackDigest({ now: NOW })

    expect(result).toEqual({
      itemsIncluded: 3,
      recipientsEmailed: 3,
      errors: 0,
    })
    expect(mockSend).toHaveBeenCalledTimes(3)
    expect(mockSend.mock.calls.map((c) => c[0].to)).toEqual([
      'julio@fonmarketing.com',
      'mollie@fonmarketing.com',
      'caleb@fonmarketing.com',
    ])
    expect(mockSend.mock.calls[0][0].subject).toBe(
      'Weekly Relay feedback digest (3 items)',
    )
    expect(mockMark).toHaveBeenCalledWith({
      ids: expect.arrayContaining(['fb-a', 'fb-b', 'fb-c']),
      at: NOW,
    })
  })

  it('uses singular item count in subject for a single item', async () => {
    mockFind.mockResolvedValue([makeRow()])
    mockAdmins.mockResolvedValue([
      { id: 'u-1', name: 'A', email: 'a@x.com' },
    ])
    mockSend.mockResolvedValue({ id: 'r' })

    await runSendFeedbackDigest({ now: NOW })

    expect(mockSend.mock.calls[0][0].subject).toBe(
      'Weekly Relay feedback digest (1 item)',
    )
  })

  it('counts an error when a recipient send fails but still stamps if any succeeded', async () => {
    mockFind.mockResolvedValue([makeRow({ id: 'fb-x' })])
    mockAdmins.mockResolvedValue([
      { id: 'u-1', name: 'A', email: 'a@x.com' },
      { id: 'u-2', name: 'B', email: 'b@x.com' },
    ])
    mockSend
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce({ id: 'r' })

    const result = await runSendFeedbackDigest({ now: NOW })

    expect(result).toEqual({
      itemsIncluded: 1,
      recipientsEmailed: 1,
      errors: 1,
    })
    expect(mockMark).toHaveBeenCalledWith({ ids: ['fb-x'], at: NOW })
  })

  it('does not stamp when all sends fail', async () => {
    mockFind.mockResolvedValue([makeRow()])
    mockAdmins.mockResolvedValue([
      { id: 'u-1', name: 'A', email: 'a@x.com' },
    ])
    mockSend.mockRejectedValue(new Error('down'))

    const result = await runSendFeedbackDigest({ now: NOW })

    expect(result.errors).toBe(1)
    expect(result.recipientsEmailed).toBe(0)
    expect(mockMark).not.toHaveBeenCalled()
  })

  it('orders items severity-major (high, medium, low) when stamping', async () => {
    mockFind.mockResolvedValue([
      makeRow({ id: 'fb-low', severity: 'low' }),
      makeRow({ id: 'fb-high', severity: 'high' }),
      makeRow({ id: 'fb-med', severity: 'medium' }),
    ])
    mockAdmins.mockResolvedValue([
      { id: 'u-1', name: 'A', email: 'a@x.com' },
    ])
    mockSend.mockResolvedValue({ id: 'r' })

    await runSendFeedbackDigest({ now: NOW })

    expect(mockMark).toHaveBeenCalledWith({
      ids: ['fb-high', 'fb-med', 'fb-low'],
      at: NOW,
    })
  })
})
