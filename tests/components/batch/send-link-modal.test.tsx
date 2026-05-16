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

  it('calls the action with the form payload and renders the URL on success', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'cuid_link_1',
      reviewUrl: 'https://relay-app.test/review/abc123',
      expiresAt: new Date('2026-06-15'),
      emailSent: true,
      emailError: null,
    })

    render(
      <SendLinkModal
        batchId="cuid_batch_1"
        clientName="Akkoo Coffee"
        open
        onOpenChange={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/recipient name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/recipient email/i), 'jane@client.com')

    // Override the default 30-day expiry.
    const daysInput = screen.getByLabelText(/expires in/i) as HTMLInputElement
    await user.clear(daysInput)
    await user.type(daysInput, '14')

    await user.click(screen.getByRole('button', { name: /generate and send/i }))

    await waitFor(() =>
      expect(createAndSendMagicLinkAction).toHaveBeenCalledWith({
        batchId: 'cuid_batch_1',
        recipientName: 'Jane Doe',
        recipientEmail: 'jane@client.com',
        expiresInDays: 14,
      }),
    )

    // Success panel renders the URL the AM can copy.
    expect(await screen.findByTestId('send-link-success')).toBeInTheDocument()
    expect(screen.getByTestId('send-link-url')).toHaveValue(
      'https://relay-app.test/review/abc123',
    )
  })
})
