import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileSearchSheet } from '@/components/search/mobile-search-sheet'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

describe('MobileSearchSheet', () => {
  beforeEach(() => {
    pushMock.mockReset()
  })

  it('renders a search trigger button on mount', () => {
    render(<MobileSearchSheet />)
    expect(
      screen.getByRole('button', { name: /search/i }),
    ).toBeInTheDocument()
    // Input is not rendered until the trigger is activated.
    expect(
      screen.queryByLabelText(/search clients, posts, runs/i),
    ).not.toBeInTheDocument()
  })

  it('opens the sheet and reveals an input when the trigger is tapped', async () => {
    const user = userEvent.setup()
    render(<MobileSearchSheet />)
    await user.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => {
      expect(
        screen.getByLabelText(/search clients, posts, runs/i),
      ).toBeInTheDocument()
    })
  })

  it('submits the query to /search?q=... and routes via the router', async () => {
    const user = userEvent.setup()
    render(<MobileSearchSheet />)
    await user.click(screen.getByRole('button', { name: /search/i }))
    const input = await screen.findByLabelText(
      /search clients, posts, runs/i,
    )
    await user.type(input, 'cedar creek{Enter}')
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/search?q=cedar%20creek')
    })
  })

  it('does not navigate when the query is empty or whitespace', async () => {
    const user = userEvent.setup()
    render(<MobileSearchSheet />)
    await user.click(screen.getByRole('button', { name: /search/i }))
    const input = await screen.findByLabelText(
      /search clients, posts, runs/i,
    )
    await user.type(input, '   {Enter}')
    expect(pushMock).not.toHaveBeenCalled()
  })
})
