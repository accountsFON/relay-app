/**
 * Unit tests for runSendReviewReminders.
 *
 * Postgres free; mocks every collaborator (repo helper, db client,
 * Resend wrapper, signToken). Covers the orchestrator logic only.
 *
 * Spec: projects/relay-app/2026-05-19-reviewer-reminder-cron-design.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/server/repositories/reviewSessions', () => ({
  findStaleInProgressSessions: vi.fn(),
}))
vi.mock('@/db/client', () => ({
  db: {
    reviewSession: { update: vi.fn() },
    reviewItem: { count: vi.fn() },
    post: { count: vi.fn() },
    magicLink: { findUnique: vi.fn() },
    magicLinkReviewer: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))
vi.mock('@/lib/magic-link', () => ({
  signToken: vi.fn(
    ({ magicLinkId }: { magicLinkId: string }) => `signed-token-for-${magicLinkId}`,
  ),
}))
// Trigger.dev SDK pulls in node fetch / OTel at import time, so stub it
// inline rather than importing the real module.
vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (cfg: unknown) => cfg },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { runSendReviewReminders } from '@/server/jobs/sendReviewReminders'
import { findStaleInProgressSessions } from '@/server/repositories/reviewSessions'
import { db } from '@/db/client'
import { sendEmail } from '@/lib/resend'
import { signToken } from '@/lib/magic-link'

const mockFind = findStaleInProgressSessions as unknown as ReturnType<typeof vi.fn>
const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>
const mockSign = signToken as unknown as ReturnType<typeof vi.fn>
const mockSessionUpdate = db.reviewSession.update as unknown as ReturnType<typeof vi.fn>
const mockItemCount = db.reviewItem.count as unknown as ReturnType<typeof vi.fn>
const mockPostCount = db.post.count as unknown as ReturnType<typeof vi.fn>
const mockMagicLink = db.magicLink.findUnique as unknown as ReturnType<typeof vi.fn>
const mockReviewer = db.magicLinkReviewer.findUnique as unknown as ReturnType<typeof vi.fn>

const NOW = new Date('2026-06-01T14:00:00Z')

function makeStaleSession(overrides: Partial<{
  sessionId: string
  magicLinkId: string
  reviewerId: string | null
  startedAt: Date
  threshold: '48h' | '96h'
  reminder48hSentAt: Date | null
  reminder96hSentAt: Date | null
}> = {}) {
  return {
    sessionId: overrides.sessionId ?? 'sess-1',
    magicLinkId: overrides.magicLinkId ?? 'ml-1',
    reviewerId: overrides.reviewerId !== undefined ? overrides.reviewerId : 'rev-1',
    startedAt: overrides.startedAt ?? new Date('2026-05-30T10:00:00Z'),
    threshold: overrides.threshold ?? '48h',
    reminder48hSentAt: overrides.reminder48hSentAt ?? null,
    reminder96hSentAt: overrides.reminder96hSentAt ?? null,
  }
}

function makeMagicLinkContext(overrides: Partial<{
  id: string
  expiresAt: Date
  batchId: string
  batchLabel: string
  clientName: string
  amName: string
  amEmail: string
}> = {}) {
  return {
    id: overrides.id ?? 'ml-1',
    expiresAt: overrides.expiresAt ?? new Date('2026-07-01T00:00:00Z'),
    batch: {
      id: overrides.batchId ?? 'batch-1',
      label: overrides.batchLabel ?? 'May 2026',
      client: { name: overrides.clientName ?? 'My DUI Guy' },
    },
    creator: {
      id: 'u-am',
      name: overrides.amName ?? 'Mollie Huebner',
      email: overrides.amEmail ?? 'mollie@fonmarketing.com',
    },
  }
}

describe('runSendReviewReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://relay-app-xi.vercel.app'
    // Default sign stub passthrough so individual tests can override.
    mockSign.mockImplementation(
      ({ magicLinkId }: { magicLinkId: string }) => `signed-${magicLinkId}`,
    )
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('returns zero when no stale sessions found', async () => {
    mockFind.mockResolvedValue([])
    const result = await runSendReviewReminders({ now: NOW })
    expect(result).toEqual({ remindersSent: 0, errors: 0 })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('sends a 48h reminder, writes reminder48hSentAt, returns counts', async () => {
    mockFind.mockResolvedValue([makeStaleSession({ threshold: '48h' })])
    mockMagicLink.mockResolvedValue(makeMagicLinkContext())
    mockReviewer.mockResolvedValue({
      id: 'rev-1',
      name: 'Caleb Cody',
      email: 'caleb@example.com',
    })
    mockItemCount.mockResolvedValue(4)
    mockPostCount.mockResolvedValue(13)
    mockSend.mockResolvedValue({ id: 'resend-1' })

    const result = await runSendReviewReminders({ now: NOW })

    expect(result).toEqual({ remindersSent: 1, errors: 0 })
    expect(mockSend).toHaveBeenCalledTimes(1)
    const sendArg = mockSend.mock.calls[0][0]
    expect(sendArg.to).toBe('caleb@example.com')
    expect(sendArg.replyTo).toBe('mollie@fonmarketing.com')
    expect(sendArg.subject).toContain("My DUI Guy's May 2026")
    expect(sendArg.subject).toMatch(/^Reminder:/)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { reminder48hSentAt: NOW },
    })
  })

  it('uses the 96h subject and writes reminder96hSentAt for a 96h threshold session', async () => {
    mockFind.mockResolvedValue([
      makeStaleSession({
        sessionId: 'sess-2',
        magicLinkId: 'ml-2',
        reviewerId: 'rev-2',
        threshold: '96h',
        startedAt: new Date('2026-05-28T10:00:00Z'),
        reminder48hSentAt: new Date('2026-05-30T14:00:00Z'),
      }),
    ])
    mockMagicLink.mockResolvedValue(makeMagicLinkContext({ id: 'ml-2' }))
    mockReviewer.mockResolvedValue({ id: 'rev-2', name: 'R', email: 'r@example.com' })
    mockItemCount.mockResolvedValue(7)
    mockPostCount.mockResolvedValue(13)
    mockSend.mockResolvedValue({ id: 'resend-2' })

    await runSendReviewReminders({ now: NOW })

    const sendArg = mockSend.mock.calls[0][0]
    expect(sendArg.subject).toMatch(/^Still here when you're ready:/)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'sess-2' },
      data: { reminder96hSentAt: NOW },
    })
  })

  it('counts an error and skips update when the email send throws', async () => {
    mockFind.mockResolvedValue([makeStaleSession({ sessionId: 'sess-3' })])
    mockMagicLink.mockResolvedValue(makeMagicLinkContext())
    mockReviewer.mockResolvedValue({
      id: 'rev-1',
      name: 'Reviewer',
      email: 'r@example.com',
    })
    mockItemCount.mockResolvedValue(0)
    mockPostCount.mockResolvedValue(13)
    mockSend.mockRejectedValue(new Error('Resend down'))

    const result = await runSendReviewReminders({ now: NOW })
    expect(result).toEqual({ remindersSent: 0, errors: 1 })
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('counts an error and skips when reviewerId is null on the stale row', async () => {
    mockFind.mockResolvedValue([
      makeStaleSession({ sessionId: 'sess-4', reviewerId: null }),
    ])

    const result = await runSendReviewReminders({ now: NOW })

    expect(result).toEqual({ remindersSent: 0, errors: 1 })
    expect(mockMagicLink).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('counts an error and skips when the reviewer row has no email', async () => {
    mockFind.mockResolvedValue([makeStaleSession({ sessionId: 'sess-5' })])
    mockMagicLink.mockResolvedValue(makeMagicLinkContext())
    mockReviewer.mockResolvedValue({ id: 'rev-1', name: 'R', email: null })

    const result = await runSendReviewReminders({ now: NOW })

    expect(result).toEqual({ remindersSent: 0, errors: 1 })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockSessionUpdate).not.toHaveBeenCalled()
  })

  it('counts an error and skips when the magic link context is missing', async () => {
    mockFind.mockResolvedValue([makeStaleSession({ sessionId: 'sess-6' })])
    mockMagicLink.mockResolvedValue(null)

    const result = await runSendReviewReminders({ now: NOW })

    expect(result).toEqual({ remindersSent: 0, errors: 1 })
    expect(mockReviewer).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('continues processing remaining sessions after one fails', async () => {
    mockFind.mockResolvedValue([
      makeStaleSession({ sessionId: 'sess-a', magicLinkId: 'ml-a' }),
      makeStaleSession({ sessionId: 'sess-b', magicLinkId: 'ml-b' }),
    ])
    mockMagicLink
      .mockResolvedValueOnce(null) // first session blows up here
      .mockResolvedValueOnce(makeMagicLinkContext({ id: 'ml-b' }))
    mockReviewer.mockResolvedValue({
      id: 'rev-1',
      name: 'R',
      email: 'r@example.com',
    })
    mockItemCount.mockResolvedValue(2)
    mockPostCount.mockResolvedValue(10)
    mockSend.mockResolvedValue({ id: 'resend-x' })

    const result = await runSendReviewReminders({ now: NOW })

    expect(result).toEqual({ remindersSent: 1, errors: 1 })
    expect(mockSessionUpdate).toHaveBeenCalledTimes(1)
    expect(mockSessionUpdate).toHaveBeenCalledWith({
      where: { id: 'sess-b' },
      data: { reminder48hSentAt: NOW },
    })
  })

  it('builds the review URL from signToken and NEXT_PUBLIC_APP_URL', async () => {
    mockFind.mockResolvedValue([makeStaleSession()])
    mockMagicLink.mockResolvedValue(makeMagicLinkContext())
    mockReviewer.mockResolvedValue({
      id: 'rev-1',
      name: 'R',
      email: 'r@example.com',
    })
    mockItemCount.mockResolvedValue(0)
    mockPostCount.mockResolvedValue(5)
    mockSend.mockResolvedValue({ id: 'resend-x' })

    await runSendReviewReminders({ now: NOW })

    expect(mockSign).toHaveBeenCalledWith({
      magicLinkId: 'ml-1',
      expiresAt: new Date('2026-07-01T00:00:00Z').getTime(),
    })
  })
})
