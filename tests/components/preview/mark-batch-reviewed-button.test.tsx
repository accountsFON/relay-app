import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'

const markBatchReviewedMock = vi.fn()
const tickChecklistItemMock = vi.fn()

vi.mock('@/server/actions/relay', () => ({
  markBatchReviewedAction: (input: { batchId: string }) =>
    markBatchReviewedMock(input),
  tickChecklistItemAction: (input: { itemId: string; checked: boolean }) =>
    tickChecklistItemMock(input),
}))

const CHECKED_ITEM = { id: 'ci-1', label: 'Every caption has visual content', required: true, checked: true }
const UNCHECKED_ITEM = { id: 'ci-2', label: 'Designs align with brand guidelines', required: true, checked: false }

describe('MarkBatchReviewedButton', () => {
  beforeEach(() => {
    markBatchReviewedMock.mockReset()
    markBatchReviewedMock.mockResolvedValue({ batchId: 'batch-1' })
    tickChecklistItemMock.mockReset()
    tickChecklistItemMock.mockResolvedValue(undefined)
  })

  it('is disabled while open threads remain and does not open the modal on click', async () => {
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
    expect(screen.queryByTestId('mark-batch-reviewed-confirm')).not.toBeInTheDocument()
  })

  it('opens a confirm modal instead of advancing directly', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))

    // Modal is open; action has NOT fired yet.
    await screen.findByTestId('mark-batch-reviewed-confirm')
    expect(screen.getByTestId('mark-batch-reviewed-cancel')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /mark relay reviewed\?/i }),
    ).toBeInTheDocument()
    expect(markBatchReviewedMock).not.toHaveBeenCalled()
  })

  it('advances via the confirm button once every required item is checked', async () => {
    const user = userEvent.setup()
    render(
      <MarkBatchReviewedButton
        batchId="batch-1"
        openThreadCount={0}
        checklistItems={[CHECKED_ITEM]}
      />,
    )

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    const confirm = (await screen.findByTestId(
      'mark-batch-reviewed-confirm',
    )) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)

    await user.click(confirm)
    expect(markBatchReviewedMock).toHaveBeenCalledWith({ batchId: 'batch-1' })
  })

  it('keeps the confirm button disabled until all required items are checked, then enables it', async () => {
    const user = userEvent.setup()
    render(
      <MarkBatchReviewedButton
        batchId="batch-1"
        openThreadCount={0}
        checklistItems={[UNCHECKED_ITEM]}
      />,
    )

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    const confirm = (await screen.findByTestId(
      'mark-batch-reviewed-confirm',
    )) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    // Tick the required item inside the modal -> persists + enables confirm.
    await user.click(screen.getByRole('checkbox', { name: UNCHECKED_ITEM.label }))
    expect(tickChecklistItemMock).toHaveBeenCalledWith({ itemId: 'ci-2', checked: true })
    expect(confirm.disabled).toBe(false)
  })

  it('surfaces an error if the action rejects', async () => {
    markBatchReviewedMock.mockRejectedValueOnce(new Error('Relay not found'))
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    await user.click(await screen.findByTestId('mark-batch-reviewed-confirm'))

    expect(
      (await screen.findByTestId('mark-batch-reviewed-error')).textContent,
    ).toMatch(/relay not found/i)
  })

  it('is disabled with a branch hint when canAdvance is false', () => {
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} canAdvance={false} />)
    const button = screen.getByTestId('mark-batch-reviewed-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('mark-batch-reviewed-hint').textContent).toMatch(/can.t auto-advance/i)
  })

  it('is enabled when canAdvance is true (default) and no open threads', () => {
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} />)
    expect((screen.getByTestId('mark-batch-reviewed-button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('thread gate takes priority in the hint when both gates apply', () => {
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={2} canAdvance={false} />)
    expect(screen.getByTestId('mark-batch-reviewed-hint').textContent).toMatch(/2 open thread/i)
  })

  it('with no checklist items, confirm is enabled immediately (nothing required)', async () => {
    const user = userEvent.setup()
    render(<MarkBatchReviewedButton batchId="batch-1" openThreadCount={0} checklistItems={[]} />)
    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    const confirm = (await screen.findByTestId('mark-batch-reviewed-confirm')) as HTMLButtonElement
    expect(confirm.disabled).toBe(false)
  })
})
