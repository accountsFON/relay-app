import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import {
  ReviewSessionShell,
  type ReviewSessionShellPost,
} from '@/app/review/[token]/review-session-shell'
import type { ReviewItemHydrated } from '@/types/review-session'

// Stub Next router. The shell only uses `router.refresh()` in failure paths;
// resolved fetches never hit it, so a no-op is fine.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// submitSessionAction is unused in the caption-edit flow but the shell
// imports it at module scope, so stub to avoid pulling the server bundle.
vi.mock('@/server/actions/reviewSessions', () => ({
  submitSessionAction: vi.fn(),
}))

function makePost(id: string, caption: string): ReviewSessionShellPost {
  return {
    post: {
      id,
      caption,
      hashtags: [],
      mediaUrl: null,
    },
  }
}

const POSTS: ReviewSessionShellPost[] = [
  makePost('post-1', 'Original caption for post 1'),
  makePost('post-2', 'Original caption for post 2'),
]

const BASE_PROPS = {
  token: 'tok',
  clientName: 'Test Client',
  clientAvatarUrl: null,
  batchLabel: 'Test Batch May 2026',
  reviewerName: 'Test Reviewer',
  amName: 'Test AM',
  posts: POSTS,
  initialItems: [] as ReadonlyArray<ReviewItemHydrated>,
  sessionStatus: 'in_progress' as const,
}

describe('ReviewSessionShell -- caption edit wiring', () => {
  beforeEach(() => {
    // Resolve every PATCH to /api/review/[token]/draft as a no-op success.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200 } as Response),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the bottom sheet when Edit Copy is tapped on a post', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    // Sheet is not in the DOM before the user opens it.
    expect(
      screen.queryByTestId('caption-edit-sheet'),
    ).not.toBeInTheDocument()

    // Decision-button-row exposes a button per decision. Edit Copy is one of
    // three; grabbing by accessible name keeps the test resilient to layout.
    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    // Sheet renders and shows the post's original caption (verifiable when
    // expanded). The presence of the dialog testid is enough for wiring.
    expect(screen.getByTestId('caption-edit-sheet')).toBeInTheDocument()
  })

  it('Save persists suggestedCaption + decision via the draft PATCH', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    // Open the sheet on post-1.
    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    // First PATCH is the optimistic decision='caption_edited' from Edit Copy.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
    const firstCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstCall[0]).toContain('/api/review/tok/draft')
    expect(JSON.parse(firstCall[1].body)).toMatchObject({
      postId: 'post-1',
      decision: 'caption_edited',
    })

    // Type a new caption and click Save.
    const textarea = screen.getByTestId(
      'caption-edit-textarea',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, {
      target: { value: 'A better suggested caption.' },
    })
    const save = screen.getByTestId('caption-edit-save')
    await act(async () => {
      fireEvent.click(save)
    })

    // Second PATCH carries suggestedCaption + decision together.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
    const secondCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(JSON.parse(secondCall[1].body)).toMatchObject({
      postId: 'post-1',
      decision: 'caption_edited',
      suggestedCaption: 'A better suggested caption.',
    })

    // Sheet closes on save.
    await waitFor(() => {
      expect(
        screen.queryByTestId('caption-edit-sheet'),
      ).not.toBeInTheDocument()
    })
  })

  it('Cancel closes the sheet without an extra PATCH', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1) // optimistic decision PATCH
    })

    const cancel = screen.getByTestId('caption-edit-cancel')
    fireEvent.click(cancel)

    expect(
      screen.queryByTestId('caption-edit-sheet'),
    ).not.toBeInTheDocument()
    // No additional PATCH from cancel.
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('re-opens the sheet via the Suggested edit hint pill', async () => {
    const initialItem: ReviewItemHydrated = {
      id: 'item-1',
      postId: 'post-1',
      decision: 'caption_edited',
      comment: null,
      suggestedCaption: 'A prior suggestion',
      acceptedAsPostVersionId: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date(),
    }

    render(
      <ReviewSessionShell {...BASE_PROPS} initialItems={[initialItem]} />,
    )

    const hint = screen.getByTestId('review-post-card-edit-hint')
    fireEvent.click(hint)

    expect(screen.getByTestId('caption-edit-sheet')).toBeInTheDocument()

    // Sheet initialises with the saved draft, not the original caption.
    const textarea = screen.getByTestId(
      'caption-edit-textarea',
    ) as HTMLTextAreaElement
    expect(textarea.value).toBe('A prior suggestion')
  })
})
