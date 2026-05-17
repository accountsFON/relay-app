import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  ReviewItemRow,
  type HydratedItemWithPost,
} from '@/components/review/review-item-row'

function baseItem(overrides: Partial<HydratedItemWithPost> = {}): HydratedItemWithPost {
  return {
    id: 'item_1',
    postId: 'post_1',
    decision: 'changes_requested',
    comment: 'Please reword the intro.',
    suggestedCaption: null,
    acceptedAsPostVersionId: null,
    updatedSinceLastReview: false,
    lastReviewedVersionId: null,
    reviewedAt: new Date('2026-05-15T11:00:00Z'),
    post: {
      id: 'post_1',
      postDate: new Date('2026-05-03T15:00:00Z'),
      caption: 'Original caption text.',
      mediaUrls: [],
    },
    ...overrides,
  }
}

describe('ReviewItemRow', () => {
  it('renders changes_requested with comment blockquote + Mark Addressed button', () => {
    const onAddressed = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewItemRow
        item={baseItem()}
        postNumber={3}
        mode="pending"
        onAddressed={onAddressed}
      />,
    )

    expect(screen.getByTestId('decision-badge-changes-requested')).toBeTruthy()
    expect(screen.getByTestId('changes-requested-comment')).toHaveTextContent(
      'Please reword the intro.',
    )
    expect(screen.getByTestId('mark-addressed-button')).toBeTruthy()
  })

  it('renders caption_edited with inline diff + Accept/Reject buttons', () => {
    const onAccept = vi.fn().mockResolvedValue(undefined)
    const onReject = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewItemRow
        item={baseItem({
          decision: 'caption_edited',
          comment: null,
          suggestedCaption: 'Original caption rewrite.',
        })}
        postNumber={1}
        mode="pending"
        onAccept={onAccept}
        onReject={onReject}
      />,
    )

    expect(screen.getByTestId('decision-badge-caption-edited')).toBeTruthy()
    expect(screen.getByTestId('caption-edited-diff-wrapper')).toBeTruthy()
    expect(screen.getByTestId('caption-diff-view')).toBeTruthy()
    expect(screen.getByTestId('accept-edit-button')).toBeTruthy()
    expect(screen.getByTestId('reject-edit-button')).toBeTruthy()
  })

  it('invokes onAddressed when the Mark Addressed button is clicked', async () => {
    const onAddressed = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewItemRow
        item={baseItem()}
        postNumber={1}
        mode="pending"
        onAddressed={onAddressed}
      />,
    )

    fireEvent.click(screen.getByTestId('mark-addressed-button'))
    await waitFor(() => expect(onAddressed).toHaveBeenCalledTimes(1))
  })

  it('hides action buttons and shows the Addressed tag in addressed mode', () => {
    render(
      <ReviewItemRow
        item={baseItem()}
        postNumber={1}
        mode="addressed"
        onAddressed={vi.fn()}
      />,
    )

    expect(screen.getByTestId('addressed-tag')).toBeTruthy()
    expect(screen.queryByTestId('mark-addressed-button')).toBeNull()
  })
})
