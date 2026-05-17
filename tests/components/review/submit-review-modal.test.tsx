import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubmitReviewModal } from '@/components/review/submit-review-modal'

const FULL_SUMMARY = {
  approved: 8,
  changesRequested: 4,
  captionEdited: 1,
  totalPosts: 13,
}

describe('SubmitReviewModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <SubmitReviewModal
        open={false}
        summary={FULL_SUMMARY}
        pendingCount={0}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the full recap and confirm CTA when no posts are pending', () => {
    const onConfirm = vi.fn()
    render(
      <SubmitReviewModal
        open
        summary={FULL_SUMMARY}
        pendingCount={0}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText(/Submit review/i)).toBeInTheDocument()
    expect(screen.getByText(/8 approved, 4 changes requested, 1 caption edit/i))
      .toBeInTheDocument()

    fireEvent.click(screen.getByTestId('submit-review-modal-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows the pending-posts warning copy when pendingCount > 0', () => {
    const onCancel = vi.fn()
    render(
      <SubmitReviewModal
        open
        summary={{
          approved: 5,
          changesRequested: 2,
          captionEdited: 0,
          totalPosts: 10,
        }}
        pendingCount={3}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByText(/3 posts still pending/i)).toBeInTheDocument()
    expect(
      screen.getByTestId('submit-review-modal-confirm').textContent,
    ).toContain('Submit anyway')

    fireEvent.click(screen.getByTestId('submit-review-modal-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
