import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  InternalReviewShell,
  type InternalReviewShellPost,
} from '@/components/review/internal-review-shell'
import {
  saveInternalDraftAction,
  submitInternalReviewAction,
} from '@/server/actions/reviewSessions'
import { createThreadAction } from '@/server/actions/threads'
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
  })

  it('renders one ReviewPostCard per post', () => {
    render(<InternalReviewShell {...BASE_PROPS} />)
    expect(screen.getAllByTestId('review-post-card')).toHaveLength(2)
  })

  it('a verdict click persists via saveInternalDraftAction with batchId + postId', async () => {
    render(<InternalReviewShell {...BASE_PROPS} />)
    const [firstApprove] = screen.getAllByTestId('decision-button-approved')
    await act(async () => {
      fireEvent.click(firstApprove)
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

  it('pins route through the Clerk-authed createThreadAction', async () => {
    // After submit the post-level Comments composer renders even with no
    // existing thread; sending a message there fires onCreatePin -> the
    // internal createThreadAction (post-level pin), not the token endpoint.
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

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    const confirm = await screen.findByTestId('submit-review-modal-confirm')
    await act(async () => {
      fireEvent.click(confirm)
    })

    const [composer] = await screen.findAllByTestId('comment-composer-input')
    await userEvent.type(composer, 'designer please tweak the crop')
    const [send] = screen.getAllByTestId('comment-composer-send')
    await act(async () => {
      await userEvent.click(send)
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
