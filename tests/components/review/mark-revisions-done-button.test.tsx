import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkRevisionsDoneButton } from '@/components/review/mark-revisions-done-button'

describe('MarkRevisionsDoneButton', () => {
  it('renders the Mark revisions done label', () => {
    render(<MarkRevisionsDoneButton onClick={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByTestId('mark-revisions-done-button')).toHaveTextContent(
      'Mark revisions done',
    )
  })

  it('invokes the onClick handler when clicked', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    render(<MarkRevisionsDoneButton onClick={handler} />)

    fireEvent.click(screen.getByTestId('mark-revisions-done-button'))
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
  })

  it('disables itself when disabled prop is set', () => {
    render(
      <MarkRevisionsDoneButton
        onClick={vi.fn().mockResolvedValue(undefined)}
        disabled
      />,
    )
    expect(
      (screen.getByTestId('mark-revisions-done-button') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('surfaces a soft error when the action rejects', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'))
    render(<MarkRevisionsDoneButton onClick={handler} />)

    fireEvent.click(screen.getByTestId('mark-revisions-done-button'))
    await waitFor(() =>
      expect(screen.getByTestId('mark-revisions-done-error')).toHaveTextContent(
        'boom',
      ),
    )
  })

  // ---- open-thread gate ----

  it('is disabled with a hint and does not invoke onClick when openThreadCount=2', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MarkRevisionsDoneButton onClick={handler} openThreadCount={2} />)

    const button = screen.getByTestId('mark-revisions-done-button') as HTMLButtonElement
    expect(button.disabled).toBe(true)

    expect(screen.getByTestId('mark-revisions-done-hint').textContent).toMatch(
      /Resolve 2 open threads before marking revisions done/i,
    )

    await user.click(button)
    expect(handler).not.toHaveBeenCalled()
  })

  it('shows singular hint text when openThreadCount=1', () => {
    render(<MarkRevisionsDoneButton onClick={vi.fn()} openThreadCount={1} />)
    expect(screen.getByTestId('mark-revisions-done-hint').textContent).toMatch(
      /Resolve 1 open thread before marking revisions done/i,
    )
    // Confirm it does NOT contain "threads" (plural)
    expect(screen.getByTestId('mark-revisions-done-hint').textContent).not.toMatch(
      /open threads/i,
    )
  })

  it('is enabled and calls onClick when openThreadCount=0', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    render(<MarkRevisionsDoneButton onClick={handler} openThreadCount={0} />)

    const button = screen.getByTestId('mark-revisions-done-button') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(screen.queryByTestId('mark-revisions-done-hint')).not.toBeInTheDocument()

    fireEvent.click(button)
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
  })
})
