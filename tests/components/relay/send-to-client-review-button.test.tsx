import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SendToClientReviewButton } from '@/components/relay/send-to-client-review-button'
import { QA_ONCE_OVER_ITEMS } from '@/lib/relay-final-qa'

vi.mock('@/components/batch/send-link-modal', () => ({
  SendLinkModal: ({ onSent }: { onSent: () => void }) => (
    <button data-testid="send-link-modal-stub" onClick={onSent}>send link</button>
  ),
}))

const base = { batchId: 'b1', clientName: 'Acme', clientReviewEmail: null }

function tickAll() {
  for (const label of QA_ONCE_OVER_ITEMS) fireEvent.click(screen.getByRole('checkbox', { name: label }))
}

describe('SendToClientReviewButton', () => {
  it('labels the button per client review mode', () => {
    const { rerender } = render(<SendToClientReviewButton {...base} clientReviewEnabled onAdvance={vi.fn()} />)
    expect(screen.getByRole('button', { name: /send to client review/i })).toBeInTheDocument()
    rerender(<SendToClientReviewButton {...base} clientReviewEnabled={false} onAdvance={vi.fn()} />)
    expect(screen.getByRole('button', { name: /final qa/i })).toBeInTheDocument()
  })

  it('gates continue on the once-over then opens the send-link modal (review), advancing only after link sent', () => {
    const onAdvance = vi.fn()
    render(<SendToClientReviewButton {...base} clientReviewEnabled onAdvance={onAdvance} />)
    fireEvent.click(screen.getByRole('button', { name: /send to client review/i }))
    const cont = screen.getByRole('button', { name: /^continue/i })
    expect(cont).toBeDisabled()
    tickAll()
    expect(cont).toBeEnabled()
    fireEvent.click(cont)
    expect(onAdvance).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('send-link-modal-stub'))
    expect(onAdvance).toHaveBeenCalledOnce()
  })

  it('advances directly without a link when no review', () => {
    const onAdvance = vi.fn()
    render(<SendToClientReviewButton {...base} clientReviewEnabled={false} onAdvance={onAdvance} />)
    fireEvent.click(screen.getByRole('button', { name: /final qa/i }))
    tickAll()
    fireEvent.click(screen.getByRole('button', { name: /move to scheduling/i }))
    expect(onAdvance).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('send-link-modal-stub')).toBeNull()
  })

  it('gates the skip-link bypass on the once-over too, then advances without a link', () => {
    const onAdvance = vi.fn()
    render(<SendToClientReviewButton {...base} clientReviewEnabled onAdvance={onAdvance} />)
    fireEvent.click(screen.getByRole('button', { name: /send to client review/i }))
    const skip = screen.getByRole('button', { name: /skip link and advance/i })
    expect(skip).toBeDisabled()
    tickAll()
    expect(skip).toBeEnabled()
    fireEvent.click(skip)
    expect(onAdvance).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('send-link-modal-stub')).toBeNull()
  })
})
