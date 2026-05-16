import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'

const markBatchReviewedMock = vi.fn()

vi.mock('@/server/actions/relay', () => ({
  markBatchReviewedAction: (input: { batchId: string; reason: string }) =>
    markBatchReviewedMock(input),
}))

describe('MarkBatchReviewedButton', () => {
  beforeEach(() => {
    markBatchReviewedMock.mockReset()
    markBatchReviewedMock.mockResolvedValue({
      batchId: 'batch-1',
      resolvedThreadCount: 2,
    })
  })

  it('opens the confirm dialog with the open thread count when clicked', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={2} />)

    // Dialog is closed by default — no count copy yet.
    expect(
      screen.queryByTestId('mark-batch-reviewed-thread-count'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))

    const countNode = await screen.findByTestId(
      'mark-batch-reviewed-thread-count',
    )
    expect(countNode.textContent).toBe('2 open threads')

    // Confirm button is gated on a non-empty reason.
    const confirm = screen.getByTestId(
      'mark-batch-reviewed-confirm',
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    // No action call yet.
    expect(markBatchReviewedMock).not.toHaveBeenCalled()
  })

  it('cancel closes the dialog without invoking the server action', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    expect(
      screen.getByTestId('mark-batch-reviewed-cancel'),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('mark-batch-reviewed-cancel'))

    // Dialog gone, action never called.
    expect(
      screen.queryByTestId('mark-batch-reviewed-cancel'),
    ).not.toBeInTheDocument()
    expect(markBatchReviewedMock).not.toHaveBeenCalled()
  })
})
