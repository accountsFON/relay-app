/**
 * Unit tests for src/server/services/sendNotificationRollupEmail.ts.
 *
 * Mocks `@/lib/resend` at the module boundary so we can assert the exact
 * payload (subject + recipient + React template props) the service builds
 * without hitting the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}))

vi.mock('@/lib/resend', () => ({
  sendEmail: sendEmailMock,
}))

import { sendNotificationRollupEmail } from '@/server/services/sendNotificationRollupEmail'
import type { RollupEmailContent } from '@/lib/notification-email-rollup'

const content: RollupEmailContent = {
  totalCount: 2,
  clientCount: 1,
  groups: [
    {
      clientId: 'c1',
      clientName: 'Alpha Co',
      items: [
        {
          mentionId: 'mention_a1',
          summary: 'Mollie replied on Post 3',
          href: 'https://x.test/a1',
          createdAt: new Date(),
        },
        {
          mentionId: 'mention_a2',
          summary: 'Mollie resolved the thread on Post 3',
          href: 'https://x.test/a2',
          createdAt: new Date(),
        },
      ],
    },
  ],
}

beforeEach(() => {
  sendEmailMock.mockReset()
})

describe('sendNotificationRollupEmail', () => {
  it('sends to the recipient with the built subject and returns the id', async () => {
    sendEmailMock.mockResolvedValueOnce({ id: 'em_1' })

    const result = await sendNotificationRollupEmail({
      recipientName: 'Julio Aleman',
      recipientEmail: 'julio@example.com',
      content,
      inboxUrl: 'https://x.test/inbox',
    })

    expect(result).toEqual({ messageId: 'em_1' })
    const arg = sendEmailMock.mock.calls[0][0]
    expect(arg.to).toBe('julio@example.com')
    expect(arg.subject).toBe('[Relay] 2 updates on Alpha Co')
  })

  it('sets no reply-to, because a rollup has many actors', async () => {
    sendEmailMock.mockResolvedValueOnce({ id: 'em_1' })

    await sendNotificationRollupEmail({
      recipientName: 'Julio Aleman',
      recipientEmail: 'julio@example.com',
      content,
      inboxUrl: 'https://x.test/inbox',
    })

    expect(sendEmailMock.mock.calls[0][0].replyTo).toBeUndefined()
  })

  it('propagates a Resend failure so the caller can release the claim', async () => {
    sendEmailMock.mockRejectedValueOnce(new Error('Resend send failed'))

    await expect(
      sendNotificationRollupEmail({
        recipientName: 'Julio Aleman',
        recipientEmail: 'julio@example.com',
        content,
        inboxUrl: 'https://x.test/inbox',
      }),
    ).rejects.toThrow('Resend send failed')
  })
})
