import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'

const markBatchReviewedMock = vi.fn()

vi.mock('@/server/actions/relay', () => ({
  markBatchReviewedAction: (input: { batchId: string }) =>
    markBatchReviewedMock(input),
}))

describe('MarkBatchReviewedButton', () => {
  beforeEach(() => {
    markBatchReviewedMock.mockReset()
    markBatchReviewedMock.mockResolvedValue({ batchId: 'batch-1' })
  })

  it('is disabled while open threads remain and does not advance on click', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={2} />)

    const button = screen.getByTestId(
      'mark-batch-reviewed-button',
    ) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    // A hint tells the AM why it is disabled.
    expect(screen.getByTestId('mark-batch-reviewed-hint').textContent).toMatch(
      /2 open thread/i,
    )

    await user.click(button)
    expect(markBatchReviewedMock).not.toHaveBeenCalled()
  })

  it('is enabled at zero open threads and advances on click (no reason)', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)

    const button = screen.getByTestId(
      'mark-batch-reviewed-button',
    ) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(
      screen.queryByTestId('mark-batch-reviewed-hint'),
    ).not.toBeInTheDocument()

    await user.click(button)
    expect(markBatchReviewedMock).toHaveBeenCalledWith({ batchId: 'batch-1' })
  })

  it('surfaces an error if the action rejects', async () => {
    markBatchReviewedMock.mockRejectedValueOnce(new Error('Relay not found'))
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))

    expect(
      (await screen.findByTestId('mark-batch-reviewed-error')).textContent,
    ).toMatch(/relay not found/i)
  })
})
