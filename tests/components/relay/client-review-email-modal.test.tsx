import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelayStep } from '@prisma/client'

vi.mock('@/server/actions/magicLink', () => ({ createAndSendMagicLinkAction: vi.fn() }))
vi.mock('@/server/actions/relay', () => ({ passBatonAction: vi.fn() }))

import { createAndSendMagicLinkAction } from '@/server/actions/magicLink'
import { passBatonAction } from '@/server/actions/relay'
import { ClientReviewEmailModal } from '@/components/relay/client-review-email-modal'

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  batchId: 'cuid_batch_1',
  clientName: 'Akkoo Coffee',
  toStep: RelayStep.sent_to_client,
  onComplete: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

describe('ClientReviewEmailModal', () => {
  it('save & send: sends the link then passes, then completes', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'l', reviewUrl: 'u', expiresAt: new Date(), emailSent: true, emailError: null,
    })
    vi.mocked(passBatonAction).mockResolvedValue({} as never)
    const onComplete = vi.fn()
    render(<ClientReviewEmailModal {...baseProps} onComplete={onComplete} />)
    await user.type(screen.getByLabelText(/client review email/i), 'jane@client.com')
    await user.click(screen.getByRole('button', { name: /save & send review link/i }))
    await waitFor(() =>
      expect(createAndSendMagicLinkAction).toHaveBeenCalledWith({
        batchId: 'cuid_batch_1', recipientName: 'Akkoo Coffee',
        recipientEmail: 'jane@client.com', expiresInDays: 30,
      }),
    )
    await waitFor(() =>
      expect(passBatonAction).toHaveBeenCalledWith({ batchId: 'cuid_batch_1', toStep: RelayStep.sent_to_client }),
    )
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })

  it('does not pass if the send fails', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockRejectedValue(new Error('email down'))
    render(<ClientReviewEmailModal {...baseProps} />)
    await user.type(screen.getByLabelText(/client review email/i), 'jane@client.com')
    await user.click(screen.getByRole('button', { name: /save & send review link/i }))
    await waitFor(() => expect(screen.getByText(/email down/i)).toBeInTheDocument())
    expect(passBatonAction).not.toHaveBeenCalled()
  })

  it('does not pass and keeps the modal open when the email fails to send', async () => {
    const user = userEvent.setup()
    vi.mocked(createAndSendMagicLinkAction).mockResolvedValue({
      magicLinkId: 'l', reviewUrl: 'https://relay.test/review/tok',
      expiresAt: new Date(), emailSent: false, emailError: 'SMTP refused',
    })
    render(<ClientReviewEmailModal {...baseProps} />)
    await user.type(screen.getByLabelText(/client review email/i), 'jane@client.com')
    await user.click(screen.getByRole('button', { name: /save & send review link/i }))

    // send was attempted, but the relay must NOT advance and the modal stays open
    await waitFor(() => expect(createAndSendMagicLinkAction).toHaveBeenCalled())
    expect(passBatonAction).not.toHaveBeenCalled()
    expect(baseProps.onComplete).not.toHaveBeenCalled()
    // the AM is told why + can recover the link
    expect(await screen.findByText(/SMTP refused/i)).toBeInTheDocument()
    expect(screen.getByTestId('client-review-link-url')).toHaveValue('https://relay.test/review/tok')
  })

  it('pass anyway: passes without sending', async () => {
    const user = userEvent.setup()
    vi.mocked(passBatonAction).mockResolvedValue({} as never)
    render(<ClientReviewEmailModal {...baseProps} />)
    await user.click(screen.getByRole('button', { name: /pass anyway/i }))
    await waitFor(() =>
      expect(passBatonAction).toHaveBeenCalledWith({ batchId: 'cuid_batch_1', toStep: RelayStep.sent_to_client }),
    )
    expect(createAndSendMagicLinkAction).not.toHaveBeenCalled()
  })
})
