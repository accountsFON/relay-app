/**
 * Unit tests for src/server/services/sendMagicLinkEmail.ts (Resend-backed).
 *
 * Mocks `@/lib/resend` at the module boundary so we can assert exactly
 * what payload the service builds (subject + recipient + React template)
 * without hitting the network. The MagicLinkInviteEmail template itself
 * is imported normally and rendered into a React element so we can assert
 * its props flow through unchanged.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}))

vi.mock('@/lib/resend', () => ({
  sendEmail: sendEmailMock,
}))

import {
  buildSubject,
  sendMagicLinkEmail,
  type SendMagicLinkEmailInput,
} from '@/server/services/sendMagicLinkEmail'

const baseInput: SendMagicLinkEmailInput = {
  recipientName: 'Sarah Smith',
  recipientEmail: 'sarah@example.com',
  senderName: 'Caleb Cody',
  clientName: 'My DUI Guy',
  monthLabel: 'May 2026',
  reviewUrl: 'https://relay.fonbuild.com/review/abc123',
  expiresAt: new Date('2026-05-31T12:00:00Z'),
}

beforeEach(() => {
  sendEmailMock.mockReset()
})

describe('sendMagicLinkEmail (Resend)', () => {
  it('calls sendEmail with correct subject + recipient + React component and returns messageId', async () => {
    sendEmailMock.mockResolvedValueOnce({ id: 'email_abc123' })

    const result = await sendMagicLinkEmail(baseInput)

    expect(result).toEqual({ messageId: 'email_abc123' })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)

    const payload = sendEmailMock.mock.calls[0][0]
    expect(payload.to).toBe('sarah@example.com')
    expect(payload.subject).toBe(
      'Review your social posts — My DUI Guy May 2026',
    )
    // React element passed under `react`. We can't easily snapshot the
    // rendered output here without pulling in the renderer, but we can
    // assert the element type + its props were forwarded from the input.
    expect(payload.react).toBeDefined()
    expect(payload.react.props).toMatchObject({
      recipientName: 'Sarah Smith',
      clientName: 'My DUI Guy',
      monthLabel: 'May 2026',
      reviewUrl: 'https://relay.fonbuild.com/review/abc123',
      senderName: 'Caleb Cody',
      expiresAt: baseInput.expiresAt,
    })
  })

  it('propagates Resend errors with a clear message', async () => {
    sendEmailMock.mockRejectedValue(
      new Error('Resend send failed: invalid api key (validation_error)'),
    )

    await expect(sendMagicLinkEmail(baseInput)).rejects.toThrow(
      /sendMagicLinkEmail: Resend send failed/,
    )
    await expect(sendMagicLinkEmail(baseInput)).rejects.toThrow(
      /invalid api key/,
    )
  })

  it('subject is white-label-neutral: "Review your social posts — <client> <month>" (P2 #21)', () => {
    expect(buildSubject('My DUI Guy', 'May 2026')).toBe(
      'Review your social posts — My DUI Guy May 2026',
    )
    expect(buildSubject('North Georgia Design Build', 'December 2026')).toBe(
      'Review your social posts — North Georgia Design Build December 2026',
    )
  })
})
