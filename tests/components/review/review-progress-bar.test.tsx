import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReviewProgressBar } from '@/components/review/review-progress-bar'
import type { ReviewItemHydrated } from '@/types/review-session'

function makeItem(
  postId: string,
  decision: ReviewItemHydrated['decision'],
): ReviewItemHydrated {
  return {
    id: `ri_${postId}`,
    postId,
    decision,
    comment: null,
    suggestedCaption: null,
    acceptedAsPostVersionId: null,
    addressedAt: null,
    noteResolvedAt: null,
    updatedSinceLastReview: false,
    lastReviewedVersionId: null,
    reviewedAt: new Date(),
  }
}

describe('ReviewProgressBar', () => {
  it('renders one segment per post with the right decision data attribute', () => {
    const postIds = ['p1', 'p2', 'p3']
    const itemsByPostId = {
      p1: makeItem('p1', 'approved'),
      p2: makeItem('p2', 'changes_requested'),
      // p3 left missing -> defaults to not_reviewed
    }

    render(
      <ReviewProgressBar postIds={postIds} itemsByPostId={itemsByPostId} />,
    )

    const segments = screen.getAllByTestId('review-progress-segment')
    expect(segments).toHaveLength(3)
    expect(segments[0]).toHaveAttribute('data-decision', 'approved')
    expect(segments[1]).toHaveAttribute('data-decision', 'changes_requested')
    expect(segments[2]).toHaveAttribute('data-decision', 'not_reviewed')
  })

  it('computes the N/M reviewed counter excluding not_reviewed posts', () => {
    const postIds = ['p1', 'p2', 'p3', 'p4']
    const itemsByPostId = {
      p1: makeItem('p1', 'approved'),
      p2: makeItem('p2', 'caption_edited'),
      // p3, p4 missing -> not_reviewed
    }

    render(
      <ReviewProgressBar postIds={postIds} itemsByPostId={itemsByPostId} />,
    )

    expect(screen.getByTestId('review-progress-counter').textContent).toBe(
      '2/4 reviewed',
    )
  })
})
