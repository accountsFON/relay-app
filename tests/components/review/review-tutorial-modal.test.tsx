import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewTutorialModal } from '@/components/review/review-tutorial-modal'

describe('ReviewTutorialModal', () => {
  it('renders the welcome step on mount, with no video element', () => {
    const { container } = render(<ReviewTutorialModal />)

    expect(screen.getByTestId('review-tutorial-modal')).toBeInTheDocument()
    expect(
      screen.getByTestId('review-tutorial-modal-welcome'),
    ).toBeInTheDocument()
    // The broken placeholder video is gone for good.
    expect(container.querySelector('video')).toBeNull()
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('names all four features in the welcome copy', () => {
    render(<ReviewTutorialModal />)

    const welcome = screen.getByTestId('review-tutorial-modal-welcome')
    expect(welcome).toHaveTextContent(/Approve/)
    expect(welcome).toHaveTextContent(/Changes/)
    expect(welcome).toHaveTextContent(/Edit Copy/)
    expect(welcome).toHaveTextContent(/image/i)
    expect(welcome).toHaveTextContent(/caption text/i)
    expect(welcome).toHaveTextContent(/Submit Review/)
  })

  it('starts the anchored tooltip tour when "Show me how" is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-tour'))

    // Welcome modal is replaced by the first anchored tour stop.
    expect(
      screen.queryByTestId('review-tutorial-modal-welcome'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
    expect(screen.getByTestId('tour-popover-stop-comment')).toBeInTheDocument()
  })

  it('advances through all three stops and closes on the final "Got it"', () => {
    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-tour'))

    expect(screen.getByTestId('tour-popover-stop-comment')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.getByTestId('tour-popover-stop-decide')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.getByTestId('tour-popover-stop-submit')).toBeInTheDocument()

    // Last stop's primary button finishes the tour.
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('review-tutorial-modal')).not.toBeInTheDocument()
  })

  it('closes when the tour is skipped', () => {
    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-tour'))
    fireEvent.click(screen.getByTestId('tour-popover-skip'))

    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    expect(screen.queryByTestId('review-tutorial-modal')).not.toBeInTheDocument()
  })

  it('closes when the tour X is tapped', () => {
    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-tour'))
    fireEvent.click(screen.getByTestId('tour-popover-close'))

    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('closes when "Got it, let\'s go" on the welcome step is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(screen.queryByTestId('review-tutorial-modal')).not.toBeInTheDocument()
  })

  it('closes when the welcome Skip X is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-close'))

    expect(screen.queryByTestId('review-tutorial-modal')).not.toBeInTheDocument()
  })

  it('does not make a network call on dismiss', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('closes on Escape from the welcome step', () => {
    render(<ReviewTutorialModal />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('review-tutorial-modal')).not.toBeInTheDocument()
  })
})
