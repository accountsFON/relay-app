// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/server/middleware/permissions', () => ({
  requireClientEditor: vi.fn(),
}))

vi.mock('@/server/repositories/clients', () => ({
  findClientForUser: vi.fn(),
}))

vi.mock('@/server/repositories/batches', () => ({
  findBatch: vi.fn(),
}))

vi.mock('@/server/repositories/magicLinks', () => ({
  createMagicLink: vi.fn(),
  revokeLink: vi.fn(),
}))

vi.mock('@/server/services/activity', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
  return {
    recordActivity: vi.fn(),
    ActivityKind: actual.ActivityKind,
    EventVisibility: actual.EventVisibility,
  }
})

vi.mock('@/server/services/sendMagicLinkEmail', () => ({
  sendMagicLinkEmail: vi.fn(),
}))

vi.mock('@/db/client', () => ({
  db: {
    user: { findUnique: vi.fn() },
    magicLink: { findUnique: vi.fn() },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import { requireClientEditor } from '@/server/middleware/permissions'
import { findClientForUser } from '@/server/repositories/clients'
import { findBatch } from '@/server/repositories/batches'
import {
  createMagicLink,
  revokeLink,
} from '@/server/repositories/magicLinks'
import { recordActivity, ActivityKind } from '@/server/services/activity'
import { sendMagicLinkEmail } from '@/server/services/sendMagicLinkEmail'
import { db } from '@/db/client'
import {
  createAndSendMagicLinkAction,
  revokeMagicLinkAction,
  getFreshUrlForLinkAction,
  resendMagicLinkEmailAction,
} from '@/server/actions/magicLink'

const mockCtx = {
  userId: 'user_clerk_am',
  orgId: 'org_clerk_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_am_1',
  avatarUrl: null,
  platformOwner: false,
  linkedClientId: null,
  permissionOverrides: null,
  roleDefaults: {},
}

const mockBatch = {
  id: 'cuid_batch_1',
  clientId: 'cuid_client_1',
  label: 'May 2026',
  scheduledAt: new Date('2026-05-01T00:00:00Z'),
  createdAt: new Date('2026-04-15T00:00:00Z'),
  clientReviewEnabled: true,
} as unknown as NonNullable<
  Awaited<ReturnType<typeof import('@/server/repositories/batches').findBatch>>
>

const mockClient = {
  id: 'cuid_client_1',
  name: 'Akkoo Coffee',
  organizationId: 'cuid_org_1',
} as unknown as NonNullable<
  Awaited<ReturnType<typeof import('@/server/repositories/clients').findClientForUser>>
>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireClientEditor).mockResolvedValue(mockCtx)
})

describe('createAndSendMagicLinkAction', () => {
  it('creates the link, sends the email, and emits a magic_link_created ActivityEvent', async () => {
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: {
        id: 'cuid_link_1',
        batchId: mockBatch.id,
      } as never,
      token: 'rawtoken123',
    })
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: 'Caleb Cody',
      email: 'caleb@fonmarketing.com',
    } as never)
    vi.mocked(sendMagicLinkEmail).mockResolvedValue({ messageId: 'msg_1' })

    const result = await createAndSendMagicLinkAction({
      batchId: mockBatch.id,
      recipientName: 'Jane Doe',
      recipientEmail: 'jane@client.com',
      expiresInDays: 14,
    })

    // Token surfaces in the URL the AM receives.
    expect(result.reviewUrl).toContain('/review/rawtoken123')
    expect(result.magicLinkId).toBe('cuid_link_1')
    expect(result.emailSent).toBe(true)
    expect(result.emailError).toBeNull()

    // The repository was called with the AM as the creator and a future expiresAt.
    const createInput = vi.mocked(createMagicLink).mock.calls[0][0]
    expect(createInput.createdBy).toBe(mockCtx.userDbId)
    expect(createInput.defaultReviewerName).toBe('Jane Doe')
    expect(createInput.defaultReviewerEmail).toBe('jane@client.com')
    expect(createInput.expiresAt.getTime()).toBeGreaterThan(Date.now())

    // Email went out with the recipient + client name in the payload.
    const emailInput = vi.mocked(sendMagicLinkEmail).mock.calls[0][0]
    expect(emailInput.recipientEmail).toBe('jane@client.com')
    expect(emailInput.clientName).toBe('Akkoo Coffee')
    expect(emailInput.senderName).toBe('Caleb Cody')

    // ActivityEvent emitted with the correct kind + clientId.
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.clientId).toBe(mockBatch.clientId)
    expect(activityInput.kind).toBe(ActivityKind.magic_link_created)
    expect(activityInput.payload).toMatchObject({
      magicLinkId: 'cuid_link_1',
      batchId: mockBatch.id,
      recipientName: 'Jane Doe',
      recipientEmail: 'jane@client.com',
    })
  })

  it('rejects callers who lack access to the batch (findClientForUser returns null → notFound)', async () => {
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    // Caller does not have scope on this client.
    vi.mocked(findClientForUser).mockResolvedValue(null as never)

    await expect(
      createAndSendMagicLinkAction({
        batchId: mockBatch.id,
        recipientName: 'Jane Doe',
        recipientEmail: 'jane@client.com',
      }),
    ).rejects.toThrow(/NEXT_NOT_FOUND/)

    // No link minted, no email sent, no activity recorded.
    expect(createMagicLink).not.toHaveBeenCalled()
    expect(sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('still returns success with emailError set when the email worker throws', async () => {
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: { id: 'cuid_link_2', batchId: mockBatch.id } as never,
      token: 'raw2',
    })
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: 'Caleb',
      email: 'caleb@fonmarketing.com',
    } as never)
    vi.mocked(sendMagicLinkEmail).mockRejectedValue(new Error('worker down'))

    const result = await createAndSendMagicLinkAction({
      batchId: mockBatch.id,
      recipientName: 'Jane',
      recipientEmail: 'jane@client.com',
    })

    expect(result.emailSent).toBe(false)
    expect(result.emailError).toMatch(/worker down/)
    // Link + activity still recorded so the AM can recover by copy-paste.
    expect(createMagicLink).toHaveBeenCalled()
    expect(recordActivity).toHaveBeenCalled()
  })
})

describe('createAndSendMagicLinkAction, clientReviewEnabled gate', () => {
  it('rejects when the batch has clientReviewEnabled = false', async () => {
    const noReviewBatch = {
      ...mockBatch,
      clientReviewEnabled: false,
    } as unknown as NonNullable<
      Awaited<ReturnType<typeof import('@/server/repositories/batches').findBatch>>
    >
    vi.mocked(findBatch).mockResolvedValue(noReviewBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)

    await expect(
      createAndSendMagicLinkAction({
        batchId: noReviewBatch.id,
        recipientName: 'Test Reviewer',
        recipientEmail: 'test@example.com',
      }),
    ).rejects.toThrow(/client review/i)

    // No side effects: link not minted, no email, no activity.
    expect(createMagicLink).not.toHaveBeenCalled()
    expect(sendMagicLinkEmail).not.toHaveBeenCalled()
    expect(recordActivity).not.toHaveBeenCalled()
  })

  it('succeeds when the batch has clientReviewEnabled = true', async () => {
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: {
        id: 'cuid_link_gate_ok',
        batchId: mockBatch.id,
      } as never,
      token: 'gate-ok-token',
    })
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: 'Caleb Cody',
      email: 'caleb@fonmarketing.com',
    } as never)
    vi.mocked(sendMagicLinkEmail).mockResolvedValue({ messageId: 'msg_gate_ok' })

    const result = await createAndSendMagicLinkAction({
      batchId: mockBatch.id,
      recipientName: 'Test',
      recipientEmail: 'test@example.com',
    })

    expect(result.magicLinkId).toBe('cuid_link_gate_ok')
    expect(createMagicLink).toHaveBeenCalled()
  })
})

describe('revokeMagicLinkAction', () => {
  it('flips revokedAt via the repository after access check passes', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_1',
      batchId: mockBatch.id,
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)

    const result = await revokeMagicLinkAction({ id: 'cuid_link_1' })

    expect(result.ok).toBe(true)
    expect(revokeLink).toHaveBeenCalledWith({
      id: 'cuid_link_1',
      by: mockCtx.userDbId,
    })
  })

  it('rejects callers without scope on the underlying client', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_2',
      batchId: mockBatch.id,
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(null as never)

    await expect(revokeMagicLinkAction({ id: 'cuid_link_2' })).rejects.toThrow(
      /NEXT_NOT_FOUND/,
    )
    expect(revokeLink).not.toHaveBeenCalled()
  })
})

describe('getFreshUrlForLinkAction', () => {
  it('rotates the link (mints new, revokes old) and returns the fresh URL', async () => {
    const futureExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_old',
      batchId: mockBatch.id,
      defaultReviewerName: 'Jane Doe',
      defaultReviewerEmail: 'jane@client.com',
      expiresAt: futureExpiry,
      revokedAt: null,
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: { id: 'cuid_link_new', batchId: mockBatch.id } as never,
      token: 'fresh-token-xyz',
    })

    const result = await getFreshUrlForLinkAction({ id: 'cuid_link_old' })

    expect(result.url).toContain('/review/fresh-token-xyz')
    expect(result.magicLinkId).toBe('cuid_link_new')

    // New link minted with same recipient + expiry.
    const createInput = vi.mocked(createMagicLink).mock.calls[0][0]
    expect(createInput.defaultReviewerName).toBe('Jane Doe')
    expect(createInput.defaultReviewerEmail).toBe('jane@client.com')
    expect(createInput.expiresAt.getTime()).toBe(futureExpiry.getTime())
    expect(createInput.createdBy).toBe(mockCtx.userDbId)

    // Old link revoked.
    expect(revokeLink).toHaveBeenCalledWith({
      id: 'cuid_link_old',
      by: mockCtx.userDbId,
    })

    // Activity recorded with rotation metadata.
    expect(recordActivity).toHaveBeenCalledTimes(1)
    const activityInput = vi.mocked(recordActivity).mock.calls[0][0]
    expect(activityInput.payload).toMatchObject({
      magicLinkId: 'cuid_link_new',
      rotatedFrom: 'cuid_link_old',
      reason: 'fresh_url',
    })

    // No email side effect on getFreshUrl.
    expect(sendMagicLinkEmail).not.toHaveBeenCalled()
  })

  it('refuses to rotate an already revoked link', async () => {
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_revoked',
      batchId: mockBatch.id,
      defaultReviewerName: 'Jane',
      defaultReviewerEmail: 'jane@client.com',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(),
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)

    await expect(
      getFreshUrlForLinkAction({ id: 'cuid_link_revoked' }),
    ).rejects.toThrow(/revoked/i)

    expect(createMagicLink).not.toHaveBeenCalled()
    expect(revokeLink).not.toHaveBeenCalled()
  })
})

describe('resendMagicLinkEmailAction', () => {
  it('rotates the link, sends a new email, and returns the new URL', async () => {
    const futureExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_old',
      batchId: mockBatch.id,
      defaultReviewerName: 'Jane Doe',
      defaultReviewerEmail: 'jane@client.com',
      expiresAt: futureExpiry,
      revokedAt: null,
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: { id: 'cuid_link_new', batchId: mockBatch.id } as never,
      token: 'resend-token-abc',
    })
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: 'Caleb Cody',
      email: 'caleb@fonmarketing.com',
    } as never)
    vi.mocked(sendMagicLinkEmail).mockResolvedValue({ messageId: 'msg_resend' })

    const result = await resendMagicLinkEmailAction({ id: 'cuid_link_old' })

    expect(result.ok).toBe(true)
    expect(result.newUrl).toContain('/review/resend-token-abc')
    expect(result.magicLinkId).toBe('cuid_link_new')
    expect(result.emailSent).toBe(true)
    expect(result.emailError).toBeNull()

    // Email went to the same recipient + carried the new URL.
    const emailInput = vi.mocked(sendMagicLinkEmail).mock.calls[0][0]
    expect(emailInput.recipientEmail).toBe('jane@client.com')
    expect(emailInput.recipientName).toBe('Jane Doe')
    expect(emailInput.reviewUrl).toContain('/review/resend-token-abc')
    expect(emailInput.senderName).toBe('Caleb Cody')
    expect(emailInput.clientName).toBe('Akkoo Coffee')

    // Old link revoked, activity emitted with reason=resend.
    expect(revokeLink).toHaveBeenCalledWith({
      id: 'cuid_link_old',
      by: mockCtx.userDbId,
    })
    expect(recordActivity).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordActivity).mock.calls[0][0].payload).toMatchObject({
      rotatedFrom: 'cuid_link_old',
      reason: 'resend',
    })
  })

  it('still returns ok when the email worker throws (link rotation succeeded)', async () => {
    const futureExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    vi.mocked(db.magicLink.findUnique).mockResolvedValue({
      id: 'cuid_link_old',
      batchId: mockBatch.id,
      defaultReviewerName: 'Jane',
      defaultReviewerEmail: 'jane@client.com',
      expiresAt: futureExpiry,
      revokedAt: null,
    } as never)
    vi.mocked(findBatch).mockResolvedValue(mockBatch)
    vi.mocked(findClientForUser).mockResolvedValue(mockClient)
    vi.mocked(createMagicLink).mockResolvedValue({
      link: { id: 'cuid_link_new', batchId: mockBatch.id } as never,
      token: 'tok2',
    })
    vi.mocked(db.user.findUnique).mockResolvedValue({
      name: 'Caleb',
      email: 'caleb@fonmarketing.com',
    } as never)
    vi.mocked(sendMagicLinkEmail).mockRejectedValue(new Error('worker down'))

    const result = await resendMagicLinkEmailAction({ id: 'cuid_link_old' })

    expect(result.ok).toBe(true)
    expect(result.emailSent).toBe(false)
    expect(result.emailError).toMatch(/worker down/)
    // The new URL is still returned so the AM can copy it.
    expect(result.newUrl).toContain('/review/tok2')
    // The old link is still revoked so we do not leave both alive.
    expect(revokeLink).toHaveBeenCalled()
  })
})
