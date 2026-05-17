/**
 * Unit tests for src/lib/resend.ts.
 *
 * The Resend SDK is mocked at the module boundary so we can assert on
 * the exact payload sent to `client.emails.send` without making real
 * network calls. Env vars are manipulated per-test because the lib reads
 * them lazily inside `sendEmail`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'

const sendMock = vi.fn()

vi.mock('resend', () => {
  class Resend {
    emails = { send: sendMock }
    constructor(_apiKey?: string) {}
  }
  return { Resend }
})

import { sendEmail } from '@/lib/resend'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  sendMock.mockReset()
  process.env.RESEND_API_KEY = 'test_resend_api_key'
  process.env.RESEND_FROM_EMAIL = 'reviews@mail.fonbuild.com'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('sendEmail', () => {
  it('returns the email id on a successful send', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_abc123' }, error: null })

    const result = await sendEmail({
      to: 'client@example.com',
      subject: 'Your review is ready',
      react: createElement('div', null, 'hi'),
    })

    expect(result).toEqual({ id: 'email_abc123' })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const payload = sendMock.mock.calls[0][0]
    expect(payload.from).toBe('reviews@mail.fonbuild.com')
    expect(payload.to).toBe('client@example.com')
    expect(payload.subject).toBe('Your review is ready')
    expect(payload.react).toBeDefined()
    // replyTo not provided, should not be on the payload
    expect(payload.replyTo).toBeUndefined()
  })

  it('throws a clear error when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY

    await expect(
      sendEmail({
        to: 'client@example.com',
        subject: 'subject',
        react: createElement('div', null, 'hi'),
      }),
    ).rejects.toThrow(/RESEND_API_KEY is not set/)

    expect(sendMock).not.toHaveBeenCalled()
  })

  it('passes replyTo through to the SDK call when provided', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'email_xyz789' }, error: null })

    await sendEmail({
      to: 'client@example.com',
      subject: 'Your review is ready',
      react: createElement('div', null, 'hi'),
      replyTo: 'caleb@fonmarketing.com',
    })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].replyTo).toBe('caleb@fonmarketing.com')
  })
})
