import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubmitReviewBar } from '@/components/review/submit-review-bar'

describe('SubmitReviewBar', () => {
  it('renders the live counter chip with approved/changes/edits', () => {
    render(
      <SubmitReviewBar
        summary={{
          approved: 8,
          changesRequested: 4,
          captionEdited: 1,
          totalPosts: 13,
        }}
        onSubmit={() => {}}
      />,
    )

    expect(screen.getByTestId('counter-approved').textContent).toBe('8 approved')
    expect(screen.getByTestId('counter-changes').textContent).toBe('4 changes')
    expect(screen.getByTestId('counter-edits').textContent).toBe('1 edits')
  })

  it('fires onSubmit when the primary button is tapped', () => {
    const onSubmit = vi.fn()
    render(
      <SubmitReviewBar
        summary={{
          approved: 0,
          changesRequested: 0,
          captionEdited: 0,
          totalPosts: 5,
        }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows Submitting... and disables the button when submitting is true', () => {
    const onSubmit = vi.fn()
    render(
      <SubmitReviewBar
        summary={{
          approved: 3,
          changesRequested: 0,
          captionEdited: 0,
          totalPosts: 3,
        }}
        onSubmit={onSubmit}
        submitting
      />,
    )

    const button = screen.getByTestId('submit-review-bar-button')
    expect(button).toBeDisabled()
    expect(button.textContent).toBe('Submitting...')
  })
})
