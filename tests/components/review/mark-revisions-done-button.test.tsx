import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
})
