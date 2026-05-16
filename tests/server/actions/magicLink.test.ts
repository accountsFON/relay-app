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
} from '@/server/actions/magicLink'

const mockCtx = {
  userId: 'user_clerk_am',
  orgId: 'org_clerk_1',
  role: 'account_manager' as const,
  plan: 'agency' as const,
  organizationDbId: 'cuid_org_1',
  userDbId: 'cuid_am_1',
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
