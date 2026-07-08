import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkBatchReviewedButton } from '@/components/preview/mark-batch-reviewed-button'
import { QA_ONCE_OVER_ITEMS } from '@/lib/relay-final-qa'

const markBatchReviewedMock = vi.fn()
const tickChecklistItemMock = vi.fn()

vi.mock('@/server/actions/relay', () => ({
  markBatchReviewedAction: (input: { batchId: string }) =>
    markBatchReviewedMock(input),
  tickChecklistItemAction: (input: { itemId: string; checked: boolean }) =>
    tickChecklistItemMock(input),
}))

// Stub the SendLinkModal so the review-enabled path can be driven without the
// real magic-link form. It only mounts when `open`, and its button fires onSent.
vi.mock('@/components/batch/send-link-modal', () => ({
  SendLinkModal: ({ open, onSent }: { open: boolean; onSent?: () => void }) =>
    open ? (
      <button
        type="button"
        data-testid="send-link-modal-stub"
        onClick={() => onSent?.()}
      >
        send review link
      </button>
    ) : null,
}))

const CHECKED_ITEM = { id: 'ci-1', label: 'Every caption has visual content', required: true, checked: true }
const UNCHECKED_ITEM = { id: 'ci-2', label: 'Designs align with brand guidelines', required: true, checked: false }

function renderButton(
  props: Partial<React.ComponentProps<typeof MarkBatchReviewedButton>> = {},
) {
  return render(
    <MarkBatchReviewedButton
      batchId="batch-1"
      openThreadCount={0}
      clientReviewEnabled={false}
      clientName="Acme"
      clientReviewEmail={null}
      {...props}
    />,
  )
}

async function tickAllQa(user: ReturnType<typeof userEvent.setup>) {
  for (const label of QA_ONCE_OVER_ITEMS) {
    await user.click(screen.getByRole('checkbox', { name: label }))
  }
}

describe('MarkBatchReviewedButton', () => {
  beforeEach(() => {
    markBatchReviewedMock.mockReset()
    markBatchReviewedMock.mockResolvedValue({ batchId: 'batch-1' })
    tickChecklistItemMock.mockReset()
    tickChecklistItemMock.mockResolvedValue(undefined)
  })

  it('is disabled while open threads remain and does not open the modal on click', async () => {
    const user = userEvent.setup()
    renderButton({ openThreadCount: 2 })

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
    renderButton()

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))

    // Modal is open; action has NOT fired yet.
    await screen.findByTestId('mark-batch-reviewed-confirm')
    expect(screen.getByTestId('mark-batch-reviewed-cancel')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /mark relay reviewed\?/i }),
    ).toBeInTheDocument()
    expect(markBatchReviewedMock).not.toHaveBeenCalled()
  })

  it('renders the 3 final QA once-over items inside the modal', async () => {
    const user = userEvent.setup()
    renderButton({ checklistItems: [CHECKED_ITEM] })

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    await screen.findByTestId('mark-batch-reviewed-confirm')

    expect(screen.getByTestId('final-qa-once-over')).toBeInTheDocument()
    for (const label of QA_ONCE_OVER_ITEMS) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps confirm disabled until BOTH required design items AND all QA once-over items are checked', async () => {
    const user = userEvent.setup()
    renderButton({ checklistItems: [UNCHECKED_ITEM] })

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    const confirm = (await screen.findByTestId(
      'mark-batch-reviewed-confirm',
    )) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    // Tick the required design item -> still gated on QA once-over.
    await user.click(screen.getByRole('checkbox', { name: UNCHECKED_ITEM.label }))
    expect(tickChecklistItemMock).toHaveBeenCalledWith({ itemId: 'ci-2', checked: true })
    expect(confirm.disabled).toBe(true)

    // Tick all QA once-over items -> now enabled.
    await tickAllQa(user)
    expect(confirm.disabled).toBe(false)
  })

  it('review-enabled: confirming opens the send-link modal and only advances after it reports sent', async () => {
    const user = userEvent.setup()
    renderButton({ clientReviewEnabled: true, checklistItems: [CHECKED_ITEM] })

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    await tickAllQa(user)

    const confirm = (await screen.findByTestId(
      'mark-batch-reviewed-confirm',
    )) as HTMLButtonElement
    expect(confirm.textContent).toMatch(/send review link & advance/i)
    await user.click(confirm)

    // Send-link modal opens; the relay has NOT advanced yet.
    const stub = await screen.findByTestId('send-link-modal-stub')
    expect(markBatchReviewedMock).not.toHaveBeenCalled()

    // The link is sent -> now the relay advances.
    await user.click(stub)
    expect(markBatchReviewedMock).toHaveBeenCalledWith({ batchId: 'batch-1' })
  })

  it('no-review: confirming advances directly and never shows the send-link modal', async () => {
    const user = userEvent.setup()
    renderButton({ clientReviewEnabled: false, checklistItems: [CHECKED_ITEM] })

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    await tickAllQa(user)

    const confirm = (await screen.findByTestId(
      'mark-batch-reviewed-confirm',
    )) as HTMLButtonElement
    expect(confirm.textContent).toMatch(/move to scheduling/i)
    await user.click(confirm)

    expect(markBatchReviewedMock).toHaveBeenCalledWith({ batchId: 'batch-1' })
    expect(screen.queryByTestId('send-link-modal-stub')).not.toBeInTheDocument()
  })

  it('surfaces an error if the action rejects', async () => {
    markBatchReviewedMock.mockRejectedValueOnce(new Error('Relay not found'))
    const user = userEvent.setup()
    renderButton()

    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    await tickAllQa(user)
    await user.click(await screen.findByTestId('mark-batch-reviewed-confirm'))

    expect(
      (await screen.findByTestId('mark-batch-reviewed-error')).textContent,
    ).toMatch(/relay not found/i)
  })

  it('is disabled with a branch hint when canAdvance is false', () => {
    renderButton({ canAdvance: false })
    const button = screen.getByTestId('mark-batch-reviewed-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByTestId('mark-batch-reviewed-hint').textContent).toMatch(/can.t auto-advance/i)
  })

  it('is enabled when canAdvance is true (default) and no open threads', () => {
    renderButton()
    expect((screen.getByTestId('mark-batch-reviewed-button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('thread gate takes priority in the hint when both gates apply', () => {
    renderButton({ openThreadCount: 2, canAdvance: false })
    expect(screen.getByTestId('mark-batch-reviewed-hint').textContent).toMatch(/2 open thread/i)
  })

  it('with no design checklist items, confirm is still gated on the QA once-over', async () => {
    const user = userEvent.setup()
    renderButton({ checklistItems: [] })
    await user.click(screen.getByTestId('mark-batch-reviewed-button'))
    const confirm = (await screen.findByTestId('mark-batch-reviewed-confirm')) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    await tickAllQa(user)
    expect(confirm.disabled).toBe(false)
  })
})
