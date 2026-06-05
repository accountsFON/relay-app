import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MarkAddressedButton } from '@/components/review/mark-addressed-button'

describe('MarkAddressedButton', () => {
  it('invokes onClick when pressed', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<MarkAddressedButton onClick={onClick} />)
    fireEvent.click(screen.getByTestId('mark-post-addressed-button'))
    await waitFor(() => expect(onClick).toHaveBeenCalledOnce())
  })

  it('shows an error when onClick rejects', async () => {
    const onClick = vi.fn().mockRejectedValue(new Error('nope'))
    render(<MarkAddressedButton onClick={onClick} />)
    fireEvent.click(screen.getByTestId('mark-post-addressed-button'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'))
  })

  it('renders with custom variant, testId, and label, and calls onClick when clicked', async () => {
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <MarkAddressedButton
        onClick={onClick}
        variant="outline"
        testId="unmark-post-addressed-button"
        label="Move back to unaddressed"
      />,
    )
    const btn = screen.getByTestId('unmark-post-addressed-button')
    expect(btn).toBeTruthy()
    expect(btn).toHaveTextContent('Move back to unaddressed')
    fireEvent.click(btn)
    await waitFor(() => expect(onClick).toHaveBeenCalledOnce())
  })
})
