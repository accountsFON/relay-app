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
  findFeedbackForResolve: vi.fn(),
  setFeedbackResolved: vi.fn(),
  reopenFeedback: vi.fn(),
  deleteFeedback: vi.fn(),
  deleteAllFeedback: vi.fn(),
}))

vi.mock('@/server/repositories/users', () => ({
  findAdminRecipients: vi.fn(),
}))

vi.mock('@/server/auth/permissions', () => ({
  can: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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

import {
  submitFeedbackAction,
  resolveFeedbackAction,
  deleteFeedbackAction,
  deleteAllFeedbackAction,
} from '@/server/actions/feedback'
import { requireOrgContext } from '@/server/middleware/auth'
import {
  createFeedback,
  markUrgentSent,
  findFeedbackForResolve,
  setFeedbackResolved,
  reopenFeedback,
  deleteFeedback,
  deleteAllFeedback,
} from '@/server/repositories/feedback'
import { findAdminRecipients } from '@/server/repositories/users'
import { can } from '@/server/auth/permissions'
import { sendEmail } from '@/lib/resend'
import { db } from '@/db/client'

const mockRequireOrg = requireOrgContext as unknown as ReturnType<typeof vi.fn>
const mockCreate = createFeedback as unknown as ReturnType<typeof vi.fn>
const mockMarkUrgent = markUrgentSent as unknown as ReturnType<typeof vi.fn>
const mockAdmins = findAdminRecipients as unknown as ReturnType<typeof vi.fn>
const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>
const mockCan = can as unknown as ReturnType<typeof vi.fn>
const mockFindForResolve = findFeedbackForResolve as unknown as ReturnType<
  typeof vi.fn
>
const mockSetResolved = setFeedbackResolved as unknown as ReturnType<typeof vi.fn>
const mockReopen = reopenFeedback as unknown as ReturnType<typeof vi.fn>
const mockDelete = deleteFeedback as unknown as ReturnType<typeof vi.fn>
const mockDeleteAll = deleteAllFeedback as unknown as ReturnType<typeof vi.fn>
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
      pageUrl: null,
      imageUrl: null,
      organizationId: 'org-1',
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

describe('submitFeedbackAction , pageUrl + imageUrl', () => {
  it('rejects an imageUrl that is not a feedback-images blob URL', async () => {
    await expect(
      submitFeedbackAction({
        bodyText: 'has bad image',
        severity: 'low',
        imageUrl: 'https://evil.com/x.png',
      }),
    ).rejects.toThrow(/feedback-images blob URL/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('forwards a valid pageUrl + feedback-images imageUrl to createFeedback', async () => {
    mockCreate.mockResolvedValue({
      id: 'fb-img',
      severity: 'low',
      bodyText: 'x',
      user: { id: 'u-1', name: 'J', email: 'j@x.com' },
    })

    await submitFeedbackAction({
      bodyText: 'see shot',
      severity: 'low',
      pageUrl: '/clients/abc',
      imageUrl:
        'https://x.public.blob.vercel-storage.com/feedback-images/1-shot.png',
    })

    expect(mockCreate).toHaveBeenCalledWith({
      userId: 'u-1',
      bodyText: 'see shot',
      severity: 'low',
      pageUrl: '/clients/abc',
      imageUrl:
        'https://x.public.blob.vercel-storage.com/feedback-images/1-shot.png',
      organizationId: 'org-1',
    })
  })
})

describe('resolveFeedbackAction', () => {
  it('throws Forbidden when the caller lacks admin.portal', async () => {
    mockCan.mockReturnValue(false)
    await expect(
      resolveFeedbackAction({ feedbackId: 'fb-1', resolved: true }),
    ).rejects.toThrow('Forbidden')
    expect(mockFindForResolve).not.toHaveBeenCalled()
  })

  it('throws not found when the row does not exist', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue(null)
    await expect(
      resolveFeedbackAction({ feedbackId: 'missing', resolved: true }),
    ).rejects.toThrow('Feedback not found')
    expect(mockSetResolved).not.toHaveBeenCalled()
  })

  it('refuses to resolve another org’s row for a non-platform-owner admin', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({
      id: 'fb-x',
      organizationId: 'org-OTHER',
    })
    await expect(
      resolveFeedbackAction({ feedbackId: 'fb-x', resolved: true }),
    ).rejects.toThrow('Feedback not found')
    expect(mockSetResolved).not.toHaveBeenCalled()
  })

  it('resolves an own-org row and records the resolver', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({ id: 'fb-1', organizationId: 'org-1' })
    mockSetResolved.mockResolvedValue(undefined)

    const res = await resolveFeedbackAction({ feedbackId: 'fb-1', resolved: true })
    expect(res).toEqual({ resolved: true })
    expect(mockSetResolved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fb-1', resolvedById: 'u-1' }),
    )
    expect(mockReopen).not.toHaveBeenCalled()
  })

  it('lets a platform owner resolve any org’s row', async () => {
    mockRequireOrg.mockResolvedValueOnce({ ...ctx, platformOwner: true })
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({
      id: 'fb-x',
      organizationId: 'org-OTHER',
    })
    mockSetResolved.mockResolvedValue(undefined)

    const res = await resolveFeedbackAction({ feedbackId: 'fb-x', resolved: true })
    expect(res).toEqual({ resolved: true })
    expect(mockSetResolved).toHaveBeenCalledOnce()
  })

  it('reopens when resolved is false', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({ id: 'fb-1', organizationId: 'org-1' })
    mockReopen.mockResolvedValue(undefined)

    const res = await resolveFeedbackAction({ feedbackId: 'fb-1', resolved: false })
    expect(res).toEqual({ resolved: false })
    expect(mockReopen).toHaveBeenCalledWith('fb-1')
    expect(mockSetResolved).not.toHaveBeenCalled()
  })
})

describe('deleteFeedbackAction', () => {
  it('throws Forbidden without admin.portal', async () => {
    mockCan.mockReturnValue(false)
    await expect(
      deleteFeedbackAction({ feedbackId: 'fb-1' }),
    ).rejects.toThrow('Forbidden')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('refuses to delete another org’s row for a non-platform-owner', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({
      id: 'fb-x',
      organizationId: 'org-OTHER',
    })
    await expect(
      deleteFeedbackAction({ feedbackId: 'fb-x' }),
    ).rejects.toThrow('Feedback not found')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes an own-org row', async () => {
    mockCan.mockReturnValue(true)
    mockFindForResolve.mockResolvedValue({ id: 'fb-1', organizationId: 'org-1' })
    mockDelete.mockResolvedValue(undefined)

    const res = await deleteFeedbackAction({ feedbackId: 'fb-1' })
    expect(res).toEqual({ deleted: true })
    expect(mockDelete).toHaveBeenCalledWith('fb-1')
  })
})

describe('deleteAllFeedbackAction', () => {
  it('throws Forbidden without admin.portal', async () => {
    mockCan.mockReturnValue(false)
    await expect(deleteAllFeedbackAction()).rejects.toThrow('Forbidden')
    expect(mockDeleteAll).not.toHaveBeenCalled()
  })

  it('passes the caller’s scope to the repo and returns the count', async () => {
    mockCan.mockReturnValue(true)
    mockDeleteAll.mockResolvedValue(4)

    const res = await deleteAllFeedbackAction()
    expect(res).toEqual({ count: 4 })
    expect(mockDeleteAll).toHaveBeenCalledWith({
      organizationDbId: 'org-1',
      platformOwner: false,
    })
  })
})
