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
  tokenHash: 'abc123tokenhash',
  clientName: 'Test Client',
  clientAvatarUrl: null,
  batchLabel: 'Test Batch May 2026',
  reviewerName: 'Test Reviewer',
  amName: 'Test AM',
  posts: POSTS,
  initialItems: [] as ReadonlyArray<ReviewItemHydrated>,
  sessionStatus: 'in_progress' as const,
}

describe('ReviewSessionShell -- inline caption edit wiring', () => {
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

  it('renders the inline caption editor when Edit Copy is tapped', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    // Inline editor is not in the DOM before the user opens it.
    expect(
      screen.queryByTestId('caption-edit-inline-textarea'),
    ).not.toBeInTheDocument()

    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    // Inline textarea renders.
    expect(
      screen.getByTestId('caption-edit-inline-textarea'),
    ).toBeInTheDocument()
  })

  it('Save persists suggestedCaption + decision via the draft PATCH', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

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
      'caption-edit-inline-textarea',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, {
      target: { value: 'A better suggested caption.' },
    })
    const save = screen.getByTestId('caption-edit-inline-save')
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

    // Inline editor closes on save.
    await waitFor(() => {
      expect(
        screen.queryByTestId('caption-edit-inline-textarea'),
      ).not.toBeInTheDocument()
    })
  })

  it('Cancel closes the inline editor and reverts the decision', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1) // optimistic decision PATCH
    })

    const cancel = screen.getByTestId('caption-edit-inline-cancel')
    fireEvent.click(cancel)

    expect(
      screen.queryByTestId('caption-edit-inline-textarea'),
    ).not.toBeInTheDocument()

    // The Cancel path reverts the decision back to `not_reviewed` via a
    // second PATCH (the prior decision before Edit Copy was tapped).
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
    const secondCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(JSON.parse(secondCall[1].body)).toMatchObject({
      postId: 'post-1',
      decision: 'not_reviewed',
    })
  })

  it('re-entering Edit Copy with a saved suggestion pre-fills the textarea', async () => {
    const initialItem: ReviewItemHydrated = {
      id: 'item-1',
      postId: 'post-1',
      decision: 'caption_edited',
      comment: null,
      suggestedCaption: 'A prior suggestion',
      acceptedAsPostVersionId: null,
      addressedAt: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date(),
    }

    render(
      <ReviewSessionShell {...BASE_PROPS} initialItems={[initialItem]} />,
    )

    // With an existing suggestion, the chrome surfaces the override + the
    // `Edited · view original` toggle. To re-enter editing, tap Edit Copy.
    const [editCopy] = screen.getAllByRole('button', {
      name: /edit copy on this post/i,
    })
    fireEvent.click(editCopy)

    const textarea = screen.getByTestId(
      'caption-edit-inline-textarea',
    ) as HTMLTextAreaElement
    expect(textarea.value).toBe('A prior suggestion')
  })
})

describe('ReviewSessionShell -- tutorial modal', () => {
  beforeEach(() => {
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

  it('renders the tutorial on the active review surface', () => {
    render(<ReviewSessionShell {...BASE_PROPS} sessionStatus="in_progress" />)

    expect(
      screen.getByTestId('review-tutorial-modal'),
    ).toBeInTheDocument()
  })

  it('does not render the tutorial on the submitted screen', () => {
    render(<ReviewSessionShell {...BASE_PROPS} sessionStatus="submitted" />)

    expect(
      screen.queryByTestId('review-tutorial-modal'),
    ).toBeNull()
  })
})
