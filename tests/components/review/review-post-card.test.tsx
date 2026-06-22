import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewPostCard } from '@/components/review/review-post-card'
import type { ReviewItemHydrated } from '@/types/review-session'

// jsdom lacks scrollIntoView; ReviewPostCard calls it when edit mode opens.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const POST = { id: 'post-1', caption: 'Original caption', hashtags: [], mediaUrl: null }

function makeItem(overrides: Partial<ReviewItemHydrated> = {}): ReviewItemHydrated {
  return {
    id: 'item-1',
    postId: 'post-1',
    decision: 'not_reviewed',
    comment: null,
    suggestedCaption: null,
    acceptedAsPostVersionId: null,
    addressedAt: null,
    updatedSinceLastReview: false,
    lastReviewedVersionId: null,
    reviewedAt: new Date(),
    ...overrides,
  }
}

describe('ReviewPostCard', () => {
  it('opens the inline caption editor from the Edit copy link', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={() => {}}
        onCaptionEditSave={vi.fn()}
      />,
    )
    expect(
      screen.queryByTestId('caption-edit-inline-textarea'),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('instagram-post-edit-copy'))
    expect(
      screen.getByTestId('caption-edit-inline-textarea'),
    ).toBeInTheDocument()
  })

  it('always renders the optional Notes field, for both verdicts', () => {
    const { rerender } = render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem({ decision: 'approved' })}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={() => {}}
      />,
    )
    expect(screen.getByTestId('review-post-card-notes-label')).toHaveTextContent(
      /notes \(optional\)/i,
    )
    rerender(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem({ decision: 'changes_requested' })}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={() => {}}
      />,
    )
    expect(screen.getByTestId('review-post-card-notes-label')).toBeInTheDocument()
  })
})
