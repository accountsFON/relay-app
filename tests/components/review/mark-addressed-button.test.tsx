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
})
