// @vitest-environment node
/**
 * Unit tests for submitFeedbackAction (Phase 5 item 27).
 *
 * Covers:
 *   - input validation (empty body, oversize body, invalid severity)
 *   - happy path low / medium severity inserts row, does NOT fire urgent email
 *   - happy path high severity inserts row + fires urgent email + stamps sentUrgentAt
 *   - urgent send failure does not fail the action (digest still picks it up)
 *   - empty admin recipients short-circuits urgent path
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: vi.fn(),
}))

vi.mock('@/server/repositories/feedback', () => ({
  createFeedback: vi.fn(),
  markUrgentSent: vi.fn(),
}))

vi.mock('@/server/repositories/users', () => ({
  findAdminRecipients: vi.fn(),
}))

vi.mock('@/lib/resend', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    feedback: {
      findUnique: vi.fn(),
    },
  },
}))

import { submitFeedbackAction } from '@/server/actions/feedback'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  createFeedback,
  markUrgentSent,
} from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { sendEmail } from '@/lib/resend'
import { db } from '@/db/client'

const mockRequireOrg = requireOrgContext as unknown as ReturnType<typeof vi.fn>
const mockCreate = createFeedback as unknown as ReturnType<typeof vi.fn>
const mockMarkUrgent = markUrgentSent as unknown as ReturnType<typeof vi.fn>
const mockAdmins = findAdminRecipients as unknown as ReturnType<typeof vi.fn>
const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>
const mockFbFindUnique = db.feedback.findUnique as unknown as ReturnType<
  typeof vi.fn
>

const ctx = {
  userId: 'clerk_user_1',
  orgId: 'org_clerk_1',
  role: 'admin' as const,
  plan: 'smb' as const,
  organizationDbId: 'org-1',
  userDbId: 'u-1',
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireOrg.mockResolvedValue(ctx)
})

describe('submitFeedbackAction , validation', () => {
  it('rejects an empty bodyText', async () => {
    await expect(
      submitFeedbackAction({ bodyText: '   ', severity: 'medium' }),
    ).rejects.toThrow(/cannot be empty/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects an oversize bodyText', async () => {
    const huge = 'x'.repeat(4001)
    await expect(
      submitFeedbackAction({ bodyText: huge, severity: 'medium' }),
    ).rejects.toThrow(/4000 chars/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('rejects an invalid severity value', async () => {
    await expect(
      submitFeedbackAction({
        bodyText: 'broken',
        // @ts-expect-error testing runtime guard
        severity: 'critical',
      }),
    ).rejects.toThrow()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('submitFeedbackAction , happy paths', () => {
  it('low severity inserts the row and does NOT fire the urgent email', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-low',
      userId: 'u-1',
      severity: 'low',
      bodyText: 'minor',
      createdAt: new Date(),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })

    const result = await submitFeedbackAction({
      bodyText: 'minor',
      severity: 'low',
    })

    expect(result.feedbackId).toBe('fb-low')
    expect(result.urgentEmailSent).toBe(false)
    expect(mockCreate).toHaveBeenCalledWith({
      userId: 'u-1',
      bodyText: 'minor',
      severity: 'low',
    })
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockMarkUrgent).not.toHaveBeenCalled()
  })

  it('medium severity does NOT fire the urgent email', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-med',
      userId: 'u-1',
      severity: 'medium',
      bodyText: 'meh',
      createdAt: new Date(),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })

    const result = await submitFeedbackAction({
      bodyText: 'meh',
      severity: 'medium',
    })

    expect(result.urgentEmailSent).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('high severity fires urgent email to every admin and stamps sentUrgentAt', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-high',
      userId: 'u-1',
      severity: 'high',
      bodyText: 'BROKE',
      createdAt: new Date('2026-06-01T12:34:00Z'),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })
    mockFbFindUnique.mockResolvedValue({
      id: 'fb-high',
      bodyText: 'BROKE',
      createdAt: new Date('2026-06-01T12:34:00Z'),
      severity: 'high',
      user: {
        id: 'u-1',
        name: 'Julio Aleman',
        email: 'julio@fonmarketing.com',
      },
    })
    mockAdmins.mockResolvedValue([
      { id: 'u-julio', name: 'Julio', email: 'julio@fonmarketing.com' },
      { id: 'u-mollie', name: 'Mollie', email: 'mollie@fonmarketing.com' },
    ])
    mockSend.mockResolvedValue({ id: 'resend-x' })
    mockMarkUrgent.mockResolvedValue(undefined)

    const result = await submitFeedbackAction({
      bodyText: 'BROKE',
      severity: 'high',
    })

    expect(result.urgentEmailSent).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
    const first = mockSend.mock.calls[0][0]
    expect(first.subject).toBe('[URGENT] Relay bug report from Julio Aleman')
    expect(first.replyTo).toBe('julio@fonmarketing.com')
    expect(mockMarkUrgent).toHaveBeenCalledWith({
      id: 'fb-high',
      at: expect.any(Date),
    })
  })

  it('high severity with all sends failing does NOT throw, does not stamp urgent', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-high',
      userId: 'u-1',
      severity: 'high',
      bodyText: 'still broke',
      createdAt: new Date(),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })
    mockFbFindUnique.mockResolvedValue({
      id: 'fb-high',
      bodyText: 'still broke',
      createdAt: new Date(),
      severity: 'high',
      user: { id: 'u-1', name: 'J', email: 'j@x.com' },
    })
    mockAdmins.mockResolvedValue([
      { id: 'u-a', name: 'A', email: 'a@x.com' },
    ])
    mockSend.mockRejectedValue(new Error('down'))

    const result = await submitFeedbackAction({
      bodyText: 'still broke',
      severity: 'high',
    })

    expect(result.feedbackId).toBe('fb-high')
    expect(result.urgentEmailSent).toBe(false)
    expect(mockMarkUrgent).not.toHaveBeenCalled()
  })

  it('high severity with zero admin recipients short-circuits the urgent path', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-high',
      userId: 'u-1',
      severity: 'high',
      bodyText: 'help',
      createdAt: new Date(),
      sentInDigestAt: null,
      sentUrgentAt: null,
    })
    mockFbFindUnique.mockResolvedValue({
      id: 'fb-high',
      bodyText: 'help',
      createdAt: new Date(),
      severity: 'high',
      user: { id: 'u-1', name: 'J', email: 'j@x.com' },
    })
    mockAdmins.mockResolvedValue([])

    const result = await submitFeedbackAction({
      bodyText: 'help',
      severity: 'high',
    })

    expect(result.urgentEmailSent).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
    expect(mockMarkUrgent).not.toHaveBeenCalled()
  })
})
