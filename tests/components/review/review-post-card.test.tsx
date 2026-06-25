import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewPostCard } from '@/components/review/review-post-card'
import type { ReviewItemHydrated } from '@/types/review-session'
import type { HydratedThread } from '@/server/repositories/threads'

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
        onCommentChange={vi.fn().mockResolvedValue(true)}
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
        onCommentChange={vi.fn().mockResolvedValue(true)}
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
        onCommentChange={vi.fn().mockResolvedValue(true)}
      />,
    )
    expect(screen.getByTestId('review-post-card-notes-label')).toBeInTheDocument()
  })

  it('locked: verdict row is disabled, Notes is read-only, Edit copy is not offered', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem({
          decision: 'approved',
          comment: 'a saved note',
        })}
        platform="instagram"
        mode="review"
        locked
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
        onCaptionEditSave={vi.fn()}
      />,
    )

    // Verdict buttons are visible but not clickable when locked.
    expect(screen.getByTestId('decision-button-approved')).toBeDisabled()
    expect(screen.getByTestId('decision-button-changes_requested')).toBeDisabled()

    // Notes is read-only (saved text stays readable) when locked.
    const ta = screen.getByTestId('review-post-card-comment') as HTMLTextAreaElement
    expect(ta.readOnly).toBe(true)
    expect(ta.value).toBe('a saved note')

    // The inline "Edit copy" affordance is gated off when locked.
    expect(screen.queryByTestId('instagram-post-edit-copy')).not.toBeInTheDocument()
  })
})

describe('ReviewPostCard -- post-level Comments section', () => {
  function makePostThread(
    overrides: Partial<HydratedThread> = {},
  ): HydratedThread {
    const firstComment = {
      id: 'comment-1',
      author: { kind: 'am' as const, userId: 'am-1', name: 'Mgr', avatarUrl: null },
      body: 'Replying to your note',
      createdAt: new Date(),
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    }
    return {
      id: 'thread-post-1',
      status: 'open',
      pin: { kind: 'post' },
      firstComment,
      comments: [
        firstComment,
        {
          id: 'comment-2',
          author: { kind: 'client' as const, reviewerName: 'Dana' },
          body: 'Thanks for the reply',
          createdAt: new Date(),
          imageUrl: null,
          imageWidth: null,
          imageHeight: null,
        },
      ],
      commentCount: 2,
      ...overrides,
    } as HydratedThread
  }

  it('renders an existing post-level thread and sends replies via onAppendThreadComment', async () => {
    const onAppendThreadComment = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        threads={[makePostThread()]}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
        onAppendThreadComment={onAppendThreadComment}
      />,
    )

    const section = screen.getByTestId('post-comments-section')
    expect(section).toBeInTheDocument()
    expect(screen.getAllByTestId('comment-row')).toHaveLength(2)

    await userEvent.type(
      screen.getByTestId('comment-composer-input'),
      'got it',
    )
    await userEvent.click(screen.getByTestId('comment-composer-send'))
    expect(onAppendThreadComment).toHaveBeenCalledWith('thread-post-1', 'got it')
  })

  it('locked with no post-level thread: renders a start composer wired to onCreatePin', async () => {
    const onCreatePin = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem({ decision: 'approved' })}
        threads={[]}
        platform="instagram"
        mode="review"
        locked
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
        onCreatePin={onCreatePin}
      />,
    )

    expect(screen.getByTestId('post-comments-section')).toBeInTheDocument()
    await userEvent.type(
      screen.getByTestId('comment-composer-input'),
      'one more thing',
    )
    await userEvent.click(screen.getByTestId('comment-composer-send'))
    expect(onCreatePin).toHaveBeenCalledWith({ kind: 'post' }, 'one more thing')
  })

  it('in-progress with no post-level thread: no start composer', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        threads={[]}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
        onCreatePin={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('comment-composer')).toBeNull()
  })
})

describe('ReviewPostCard -- notes auto-save', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  function renderCard(
    onCommentChange: (c: string) => Promise<boolean> = vi.fn().mockResolvedValue(true),
    item = makeItem(),
  ) {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={item}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={onCommentChange}
      />,
    )
    return onCommentChange
  }

  it('saves after a debounce pause and shows Saved', async () => {
    const onCommentChange = renderCard()
    const ta = screen.getByTestId('review-post-card-comment')

    fireEvent.change(ta, { target: { value: 'a note' } })
    expect(onCommentChange).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(onCommentChange).toHaveBeenCalledWith('a note')
    expect(screen.getByTestId('review-post-card-notes-status')).toHaveTextContent(/saved/i)
  })

  it('flushes immediately on blur without waiting for the debounce', async () => {
    const onCommentChange = renderCard()
    const ta = screen.getByTestId('review-post-card-comment')

    fireEvent.change(ta, { target: { value: 'blurred note' } })
    await act(async () => {
      fireEvent.blur(ta)
    })

    expect(onCommentChange).toHaveBeenCalledWith('blurred note')
  })

  it('does not save when the value is unchanged from the server value', async () => {
    const onCommentChange = vi.fn().mockResolvedValue(true)
    renderCard(onCommentChange, makeItem({ comment: 'existing' }))
    const ta = screen.getByTestId('review-post-card-comment')

    await act(async () => {
      fireEvent.blur(ta)
    })

    expect(onCommentChange).not.toHaveBeenCalled()
  })

  it('shows an error with Retry when the save fails, and Retry re-saves', async () => {
    const onCommentChange = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    renderCard(onCommentChange)
    const ta = screen.getByTestId('review-post-card-comment')

    fireEvent.change(ta, { target: { value: 'oops' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(screen.getByTestId('review-post-card-notes-status')).toHaveTextContent(/couldn.t save/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    })
    expect(onCommentChange).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('review-post-card-notes-status')).toHaveTextContent(/saved/i)
  })
})

describe('ReviewPostCard -- new reply badge', () => {
  it('renders the new-reply badge when hasNewReply is true', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        platform="instagram"
        mode="review"
        hasNewReply
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
      />,
    )
    expect(screen.getByTestId('new-reply-badge')).toBeInTheDocument()
  })

  it('omits the badge when hasNewReply is false', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        platform="instagram"
        mode="review"
        hasNewReply={false}
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
      />,
    )
    expect(screen.queryByTestId('new-reply-badge')).not.toBeInTheDocument()
  })

  it('omits the badge when hasNewReply is undefined', () => {
    render(
      <ReviewPostCard
        post={POST}
        clientName="Test Client"
        reviewItem={makeItem()}
        platform="instagram"
        mode="review"
        onDecisionChange={() => {}}
        onCommentChange={vi.fn().mockResolvedValue(true)}
      />,
    )
    expect(screen.queryByTestId('new-reply-badge')).not.toBeInTheDocument()
  })
})
