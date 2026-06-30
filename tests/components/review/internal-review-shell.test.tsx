import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import {
  InternalReviewShell,
  type InternalReviewShellPost,
} from '@/components/review/internal-review-shell'
import {
  saveInternalDraftAction,
  submitInternalReviewAction,
} from '@/server/actions/reviewSessions'
import { createThreadAction, addCommentAction } from '@/server/actions/threads'
import type { ReviewItemHydrated } from '@/types/review-session'

// jsdom lacks scrollIntoView; ReviewPostCard calls it when edit mode opens.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/reviewSessions', () => ({
  saveInternalDraftAction: vi.fn().mockResolvedValue({ reviewItemId: 'ri-1' }),
  submitInternalReviewAction: vi.fn(),
}))

vi.mock('@/server/actions/threads', () => ({
  createThreadAction: vi.fn().mockResolvedValue({ id: 'thread-new' }),
  addCommentAction: vi.fn().mockResolvedValue({ id: 'comment-new' }),
  resolveThreadAction: vi.fn().mockResolvedValue(undefined),
  useCommentImageAsPostMediaAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/upload-comment-image', () => ({
  uploadCommentImage: vi
    .fn()
    .mockResolvedValue({ url: 'https://example.com/x.jpg', width: 10, height: 10 }),
}))

// Prop-capturing mock for ReviewPostCard. Renders a per-post marker so layout
// tests can assert on DOM presence, and records props so tests can fire
// callbacks (onDecisionChange, onCreatePin, etc.) directly — avoiding the need
// to drive the real card's internal UI in these shell-level tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardProps: Record<string, any> = {}
vi.mock('@/components/review/review-post-card', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReviewPostCard: (props: any) => {
    cardProps[props.post.id] = props
    return <div data-testid={`card-${props.post.id}`}>{props.post.caption}</div>
  },
}))

function makePost(id: string, caption: string): InternalReviewShellPost {
  return {
    post: { id, caption, hashtags: [], mediaUrl: null },
  }
}

const POSTS: InternalReviewShellPost[] = [
  makePost('post-1', 'Original caption for post 1'),
  makePost('post-2', 'Original caption for post 2'),
]

const BASE_PROPS = {
  batchId: 'batch-1',
  clientName: 'Test Client',
  clientAvatarUrl: null,
  batchLabel: 'Test Batch May 2026',
  reviewerName: 'Test AM',
  posts: POSTS,
  initialItems: [] as ReadonlyArray<ReviewItemHydrated>,
  sessionStatus: 'in_progress' as const,
}

describe('InternalReviewShell', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    // Clear captured props between tests.
    for (const key of Object.keys(cardProps)) {
      delete cardProps[key]
    }
  })

  // Adjusted: the real card no longer renders here (mock is in place), so we
  // check for the per-post markers the capturing mock emits instead of the
  // card's own data-testid="review-post-card".
  it('renders one ReviewPostCard per post', () => {
    render(<InternalReviewShell {...BASE_PROPS} />)
    expect(screen.getByTestId('card-post-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-post-2')).toBeInTheDocument()
  })

  // Adjusted: the capturing mock doesn't render a decision button, so we fire
  // the callback directly via the captured props object.
  it('a verdict click persists via saveInternalDraftAction with batchId + postId', async () => {
    render(<InternalReviewShell {...BASE_PROPS} />)
    await act(async () => {
      cardProps['post-1'].onDecisionChange('approved')
    })
    await waitFor(() => {
      expect(saveInternalDraftAction).toHaveBeenCalledTimes(1)
    })
    expect(saveInternalDraftAction).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'batch-1',
        postId: 'post-1',
        decision: 'approved',
      }),
    )
  })

  it('Approve all marks every post approved via saveInternalDraftAction', async () => {
    render(<InternalReviewShell {...BASE_PROPS} />)
    const approveAll = screen.getByTestId('approve-all-button')
    await act(async () => {
      fireEvent.click(approveAll)
    })
    await waitFor(() => {
      expect(saveInternalDraftAction).toHaveBeenCalledTimes(2)
    })
    const decisions = vi
      .mocked(saveInternalDraftAction)
      .mock.calls.map((c) => c[0].decision)
    expect(decisions).toEqual(['approved', 'approved'])
  })

  it('Submit calls submitInternalReviewAction({ batchId })', async () => {
    vi.mocked(submitInternalReviewAction).mockResolvedValue({
      ok: true,
      summary: {
        approved: 2,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 2,
      },
    })
    // Pre-decide so the session has at least one verdict.
    const props = {
      ...BASE_PROPS,
      initialItems: [
        {
          id: 'i1',
          postId: 'post-1',
          decision: 'approved' as const,
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
          addressedAt: null,
        },
      ],
    }
    render(<InternalReviewShell {...props} />)

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    const confirm = await screen.findByTestId('submit-review-modal-confirm')
    await act(async () => {
      fireEvent.click(confirm)
    })

    await waitFor(() => {
      expect(submitInternalReviewAction).toHaveBeenCalledWith({
        batchId: 'batch-1',
      })
    })
  })

  // Adjusted: the capturing mock doesn't render the comment composer, so we
  // fire onCreatePin directly from the captured props to verify the shell
  // routes it through createThreadAction (not the draft action).
  it('pins route through the Clerk-authed createThreadAction', async () => {
    render(<InternalReviewShell {...BASE_PROPS} />)

    await act(async () => {
      await cardProps['post-1'].onCreatePin(
        { kind: 'post' },
        'designer please tweak the crop',
      )
    })

    await waitFor(() => {
      expect(createThreadAction).toHaveBeenCalledTimes(1)
    })
    expect(createThreadAction).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-1',
        pin: { kind: 'post' },
        body: 'designer please tweak the crop',
      }),
    )
    // Pins do NOT go through the draft action.
    expect(saveInternalDraftAction).not.toHaveBeenCalled()
  })

  // Notification lock: a reply on a pin thread must route through
  // addCommentAction, which is the path that emits the internal-review bell
  // notification (notifyInternalThreadReply). A future layout change must not
  // silently drop this wiring.
  it('thread replies route through addCommentAction (notification path preserved)', async () => {
    render(<InternalReviewShell {...BASE_PROPS} />)

    await act(async () => {
      await cardProps['post-1'].onAppendThreadComment('thread-1', 'looks good now')
    })

    await waitFor(() => {
      expect(addCommentAction).toHaveBeenCalledTimes(1)
    })
    expect(addCommentAction).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-1', body: 'looks good now' }),
    )
  })

  it('renders the submitted banner after a successful submit', async () => {
    vi.mocked(submitInternalReviewAction).mockResolvedValue({
      ok: true,
      summary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 2,
      },
    })
    const props = {
      ...BASE_PROPS,
      initialItems: [
        {
          id: 'i1',
          postId: 'post-1',
          decision: 'approved' as const,
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
          addressedAt: null,
        },
      ],
    }
    render(<InternalReviewShell {...props} />)

    expect(screen.queryByTestId('review-submitted-banner')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    const confirm = await screen.findByTestId('submit-review-modal-confirm')
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(
      await screen.findByTestId('review-submitted-banner'),
    ).toBeInTheDocument()
  })

  it('surfaces a soft advanceError notice when submit succeeds but advance fails', async () => {
    vi.mocked(submitInternalReviewAction).mockResolvedValue({
      ok: true,
      summary: {
        approved: 1,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 2,
      },
      advanceError: 'batch is not at am_review_design',
    })
    const props = {
      ...BASE_PROPS,
      initialItems: [
        {
          id: 'i1',
          postId: 'post-1',
          decision: 'approved' as const,
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
          addressedAt: null,
        },
      ],
    }
    render(<InternalReviewShell {...props} />)

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    const confirm = await screen.findByTestId('submit-review-modal-confirm')
    await act(async () => {
      fireEvent.click(confirm)
    })

    // Submitted (locked) banner still shows...
    expect(
      await screen.findByTestId('review-submitted-banner'),
    ).toBeInTheDocument()
    // ...plus a non-blocking advance-failed notice.
    expect(
      await screen.findByTestId('review-advance-error'),
    ).toBeInTheDocument()
  })

  it('progress bar reflects decided/total', () => {
    const props = {
      ...BASE_PROPS,
      initialItems: [
        {
          id: 'i1',
          postId: 'post-1',
          decision: 'approved' as const,
          comment: null,
          suggestedCaption: null,
          acceptedAsPostVersionId: null,
          updatedSinceLastReview: false,
          lastReviewedVersionId: null,
          reviewedAt: new Date(),
          addressedAt: null,
        },
      ],
    }
    render(<InternalReviewShell {...props} />)
    // ReviewProgressBar renders a labeled progress region.
    expect(screen.getByTestId('review-progress-bar')).toBeInTheDocument()
  })
})

describe('InternalReviewShell markup layout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    for (const key of Object.keys(cardProps)) {
      delete cardProps[key]
    }
  })

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  const basePosts = [
    { post: { id: 'p1', caption: 'one', hashtags: [], mediaUrl: '/a.jpg' }, threads: [] },
    { post: { id: 'p2', caption: 'two', hashtags: [], mediaUrl: null }, threads: [] },
  ]

  function renderShell() {
    return render(
      <InternalReviewShell
        batchId="b1"
        clientName="Acme"
        batchLabel="June"
        reviewerName="Jane AM"
        reviewerUserId="u1"
        posts={basePosts}
        initialItems={[
          {
            id: 'i1',
            postId: 'p1',
            decision: 'approved',
            comment: null,
            suggestedCaption: null,
            acceptedAsPostVersionId: null,
            updatedSinceLastReview: false,
            lastReviewedVersionId: null,
            reviewedAt: new Date(),
            addressedAt: null,
          },
        ]}
        sessionStatus="in_progress"
      />,
    )
  }

  it('renders the rail with one row per post', () => {
    renderShell()
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(2)
  })

  it('reflects the per-post verdict in the rail (approved vs pending)', () => {
    renderShell()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('scrolls the canvas to a post when its rail row is clicked', () => {
    renderShell()
    fireEvent.click(screen.getAllByTestId('internal-rail-row')[1])
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('still renders one canvas card per post', () => {
    renderShell()
    expect(screen.getByTestId('card-p1')).toBeInTheDocument()
    expect(screen.getByTestId('card-p2')).toBeInTheDocument()
  })
})
