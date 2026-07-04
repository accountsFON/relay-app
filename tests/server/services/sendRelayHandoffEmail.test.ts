/**
 * Unit tests for src/server/services/sendRelayHandoffEmail.ts.
 *
 * Mocks `@/lib/resend` at the module boundary so we can assert the exact
 * payload (subject + recipient + reply-to + React template props) the
 * service builds without hitting the network.
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
  sendRelayHandoffEmail,
  type SendRelayHandoffEmailInput,
} from '@/server/services/sendRelayHandoffEmail'

const baseInput: SendRelayHandoffEmailInput = {
  recipientName: 'Payton Monzon',
  recipientEmail: 'payton@example.com',
  actorName: 'Julio Aleman',
  actorEmail: 'julio@example.com',
  clientName: 'My DUI Guy',
  batchLabel: 'May 2026',
  stepLabel: 'Initial Design',
  direction: 'back',
  reason: 'Please redo post 3',
  relayUrl: 'https://relay-app-xi.vercel.app/clients/c1/batches/b1',
}

beforeEach(() => {
  sendEmailMock.mockReset()
})

describe('sendRelayHandoffEmail', () => {
  it('calls sendEmail with subject, recipient, reply-to actor, and forwarded template props', async () => {
    sendEmailMock.mockResolvedValueOnce({ id: 'email_xyz' })

    const result = await sendRelayHandoffEmail(baseInput)

    expect(result).toEqual({ messageId: 'email_xyz' })
    expect(sendEmailMock).toHaveBeenCalledTimes(1)

    const payload = sendEmailMock.mock.calls[0][0]
    expect(payload.to).toBe('payton@example.com')
    expect(payload.replyTo).toBe('julio@example.com')
    expect(payload.subject).toBe(
      '[Relay] My DUI Guy May 2026 sent back for re-review (Initial Design)',
    )
    expect(payload.react.props).toMatchObject({
      recipientName: 'Payton Monzon',
      actorName: 'Julio Aleman',
      clientName: 'My DUI Guy',
      batchLabel: 'May 2026',
      stepLabel: 'Initial Design',
      direction: 'back',
      reason: 'Please redo post 3',
      relayUrl: 'https://relay-app-xi.vercel.app/clients/c1/batches/b1',
    })
  })

  it('omits reply-to when the actor has no email', async () => {
    sendEmailMock.mockResolvedValueOnce({ id: 'email_1' })
    await sendRelayHandoffEmail({ ...baseInput, actorEmail: '' })
    expect(sendEmailMock.mock.calls[0][0].replyTo).toBeUndefined()
  })

  it('propagates Resend errors with a clear message', async () => {
    sendEmailMock.mockRejectedValue(new Error('invalid api key'))
    await expect(sendRelayHandoffEmail(baseInput)).rejects.toThrow(
      /sendRelayHandoffEmail: Resend send failed/,
    )
  })

  it('buildSubject differs for forward vs back', () => {
    expect(buildSubject('forward', 'My DUI Guy', 'May 2026', 'Copy Review')).toBe(
      '[Relay] My DUI Guy May 2026 is now with you (Copy Review)',
    )
    expect(buildSubject('back', 'My DUI Guy', 'May 2026', 'Copy Review')).toBe(
      '[Relay] My DUI Guy May 2026 sent back for re-review (Copy Review)',
    )
  })
})
