import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewTutorialModal } from '@/components/review/review-tutorial-modal'

describe('ReviewTutorialModal', () => {
  it('renders the welcome step on mount', () => {
    render(<ReviewTutorialModal />)

    expect(screen.getByTestId('review-tutorial-modal')).toBeInTheDocument()
    expect(
      screen.getByTestId('review-tutorial-modal-welcome'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('review-tutorial-modal-video'),
    ).not.toBeInTheDocument()
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

  it('swaps to the video step when "Show me how" is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-video'))

    expect(
      screen.queryByTestId('review-tutorial-modal-welcome'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('review-tutorial-modal-video'),
    ).toBeInTheDocument()
  })

  it('closes when "Got it" on the welcome step is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
  })

  it('closes when the Skip X is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-close'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
  })

  it('closes when "Got it" on the video step is tapped', () => {
    render(<ReviewTutorialModal />)

    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-video'))
    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it-video'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
  })

  it('does not make a network call on dismiss', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('keeps an accessible name on the video step', () => {
    render(<ReviewTutorialModal />)
    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-video'))
    const labelled = document.getElementById('review-tutorial-title')
    expect(labelled).not.toBeNull()
    expect(screen.getByTestId('review-tutorial-modal')).toHaveAttribute(
      'aria-labelledby',
      'review-tutorial-title',
    )
  })

  it('closes on Escape', () => {
    render(<ReviewTutorialModal />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
  })
})
