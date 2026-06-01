import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewTutorialModal } from '@/components/review/review-tutorial-modal'

describe('ReviewTutorialModal', () => {
  it('renders the welcome step when seen=false', () => {
    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={vi.fn()} />,
    )

    expect(screen.getByTestId('review-tutorial-modal')).toBeInTheDocument()
    expect(
      screen.getByTestId('review-tutorial-modal-welcome'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('review-tutorial-modal-video'),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Here's how this works\./)).toBeInTheDocument()
    expect(screen.getByText(/Submit Review/)).toBeInTheDocument()
  })

  it('does not render when seen=true', () => {
    render(
      <ReviewTutorialModal token="tok-123" seen={true} onMarkSeen={vi.fn()} />,
    )

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
  })

  it('swaps to the video step when "Show me how" is tapped', () => {
    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={vi.fn()} />,
    )

    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-video'))

    expect(
      screen.queryByTestId('review-tutorial-modal-welcome'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('review-tutorial-modal-video')).toBeInTheDocument()
    expect(
      screen.getByTestId('review-tutorial-modal-video-el'),
    ).toBeInTheDocument()
  })

  it('fires onMarkSeen and closes when "Got it" on welcome is tapped', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={onMarkSeen} />,
    )

    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onMarkSeen).toHaveBeenCalledTimes(1)
    })
  })

  it('fires onMarkSeen and closes when "Got it" on video step is tapped', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={onMarkSeen} />,
    )

    fireEvent.click(screen.getByTestId('review-tutorial-modal-show-video'))
    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it-video'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onMarkSeen).toHaveBeenCalledTimes(1)
    })
  })

  it('fires onMarkSeen and closes when the X is tapped (skip = persist)', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={onMarkSeen} />,
    )

    fireEvent.click(screen.getByTestId('review-tutorial-modal-close'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onMarkSeen).toHaveBeenCalledTimes(1)
    })
  })

  it('closes silently if onMarkSeen throws (optimistic dismiss)', async () => {
    const onMarkSeen = vi.fn().mockRejectedValue(new Error('network'))
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    render(
      <ReviewTutorialModal token="tok-123" seen={false} onMarkSeen={onMarkSeen} />,
    )

    fireEvent.click(screen.getByTestId('review-tutorial-modal-got-it'))

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).not.toBeInTheDocument()
    await waitFor(() => {
      expect(onMarkSeen).toHaveBeenCalledTimes(1)
    })
    consoleSpy.mockRestore()
  })
})
