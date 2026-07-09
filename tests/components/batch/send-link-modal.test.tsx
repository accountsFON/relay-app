import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/magicLink', () => ({
  createAndSendMagicLinkAction: vi.fn(),
}))

import { createAndSendMagicLinkAction } from '@/server/actions/magicLink'
import { SendLinkModal } from '@/components/batch/send-link-modal'
import { addDays, formatDateInputValue } from '@/lib/expiry-date'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SendLinkModal', () => {
  it('blocks submit until required name + email are provided and email is valid', async () => {
    const user = userEvent.setup()
    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        open
        onOpenChange={vi.fn()}
      />,
    )

    // Click submit on empty form — action must not fire (HTML required
    // gate keeps the form from submitting at all).
    await user.click(screen.getByRole('button', { name: /generate and send/i }))
    expect(createAndSendMagicLinkAction).not.toHaveBeenCalled()

    // Fill in name + an obviously bad email value. Bypass the native
    // type=email gate so the onSubmit handler runs and our JS validator
    // can flag the bad address.
    await user.type(screen.getByLabelText(/recipient name/i), 'Jane Doe')
    const emailInput = screen.getByLabelText(/recipient email/i) as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } })

    // Dispatch a real submit event on the form so we go through the
    // component's onSubmit + validate() path even though the browser
    // would normally reject the bad email.
    const form = emailInput.closest('form')!
    fireEvent.submit(form)

    expect(createAndSendMagicLinkAction).not.toHaveBeenCalled()
    expect(await screen.findByTestId('send-link-error')).toHaveTextContent(/valid/i)
  })

  it('prefills the recipient email from clientReviewEmail', () => {
    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        clientReviewEmail="jane@client.com"
        open
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/recipient email/i)).toHaveValue('jane@client.com')
  })

  it('prefills the recipient name from clientName', () => {
    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        open
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/recipient name/i)).toHaveValue('Akkoo Coffee')
  })

  it('fires onSent after a successful send', async () => {
    const user = userEvent.setup()
    const onSent = vi.fn()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'l', reviewUrl: 'https://relay.test/review/tok',
      expiresAt: new Date('2026-07-01'), emailSent: true, emailError: null,
      recipients: [{ email: 'jane@client.com', sent: true, error: null }],
    })
    render(
      <SendLinkModal
        batchId="b"
        clientName="Akkoo Coffee"
        clientReviewEmail="jane@client.com"
        open
        onOpenChange={vi.fn()}
        onSent={onSent}
      />,
    )
    await user.click(screen.getByRole('button', { name: /generate and send/i }))
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1))
  })

  it('calls the action with the form payload and renders the URL on success', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'cuid_link_1',
      reviewUrl: 'https://relay-app.test/review/abc123',
      expiresAt: new Date('2026-06-15'),
      emailSent: true,
      emailError: null,
      recipients: [{ email: 'jane@client.com', sent: true, error: null }],
    })

    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        open
        onOpenChange={vi.fn()}
      />,
    )

    // Name prefills from clientName; clear before typing a custom recipient.
    await user.clear(screen.getByLabelText(/recipient name/i))
    await user.type(screen.getByLabelText(/recipient name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/recipient email/i), 'jane@client.com')

    // Override the default expiry with an explicit date 14 days out.
    fireEvent.change(screen.getByLabelText(/link expires on/i), {
      target: { value: formatDateInputValue(addDays(new Date(), 14)) },
    })

    await user.click(screen.getByRole('button', { name: /generate and send/i }))

    await waitFor(() =>
      expect(createAndSendMagicLinkAction).toHaveBeenCalledWith({
        batchId: 'cuid_batch_1',
        recipientName: 'Jane Doe',
        recipientEmails: ['jane@client.com'],
        expiresInDays: 14,
      }),
    )

    // Success panel renders the URL the AM can copy.
    expect(await screen.findByTestId('send-link-success')).toBeInTheDocument()
    expect(screen.getByTestId('send-link-url')).toHaveValue(
      'https://relay-app.test/review/abc123',
    )
  })

  it('P2 #22: parses comma-separated recipients into a deduped list (multi-recipient)', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'l',
      reviewUrl: 'https://relay.test/review/tok',
      expiresAt: new Date('2026-07-01'),
      emailSent: true,
      emailError: null,
      recipients: [
        { email: 'jane@client.com', sent: true, error: null },
        { email: 'bob@client.com', sent: true, error: null },
      ],
    })

    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await user.clear(screen.getByLabelText(/recipient name/i))
    await user.type(screen.getByLabelText(/recipient name/i), 'Jane Doe')
    await user.type(
      screen.getByLabelText(/recipient email/i),
      'jane@client.com, bob@client.com, jane@CLIENT.com',
    )
    await user.click(screen.getByRole('button', { name: /generate and send/i }))

    await waitFor(() =>
      expect(createAndSendMagicLinkAction).toHaveBeenCalledWith({
        batchId: 'cuid_batch_1',
        recipientName: 'Jane Doe',
        recipientEmails: ['jane@client.com', 'bob@client.com'],
        // No reviewWindowDays prop → default window (7 days) seeds the expiry.
        expiresInDays: 7,
      }),
    )

    // Success line reflects the recipient count.
    expect(await screen.findByTestId('send-link-success')).toHaveTextContent(
      /emailed to 2 recipients/i,
    )
  })

  it('P2 #23: defaults the expiry date to today + the agency review window', () => {
    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        reviewWindowDays={10}
        open
        onOpenChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/link expires on/i)).toHaveValue(
      formatDateInputValue(addDays(new Date(), 10)),
    )
  })

  it('P2 #23: rejects a past expiry date (JS guard behind the native min)', async () => {
    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        clientReviewEmail="jane@client.com"
        open
        onOpenChange={vi.fn()}
      />,
    )
    const dateInput = screen.getByLabelText(/link expires on/i) as HTMLInputElement
    fireEvent.change(dateInput, {
      target: { value: formatDateInputValue(addDays(new Date(), -1)) },
    })
    // The native `min` would block a real click; submit the form directly so the
    // JS validator (defense-in-depth) runs and surfaces the error.
    fireEvent.submit(dateInput.closest('form')!)

    expect(createAndSendMagicLinkAction).not.toHaveBeenCalled()
    expect(await screen.findByTestId('send-link-error')).toHaveTextContent(/future/i)
  })
})
