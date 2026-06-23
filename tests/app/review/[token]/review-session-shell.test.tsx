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
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the inline caption editor from the Edit copy link, with no PATCH on open', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    expect(
      screen.queryByTestId('caption-edit-inline-textarea'),
    ).not.toBeInTheDocument()

    const [editCopy] = screen.getAllByRole('button', { name: /edit copy/i })
    fireEvent.click(editCopy)

    expect(
      screen.getByTestId('caption-edit-inline-textarea'),
    ).toBeInTheDocument()
    // Opening the editor is local-only; the draft PATCH fires on Save.
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('Save persists caption_edited + suggestedCaption via a single draft PATCH', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    const [editCopy] = screen.getAllByRole('button', { name: /edit copy/i })
    fireEvent.click(editCopy)

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

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/api/review/tok/draft')
    expect(JSON.parse(call[1].body)).toMatchObject({
      postId: 'post-1',
      decision: 'caption_edited',
      suggestedCaption: 'A better suggested caption.',
    })

    await waitFor(() => {
      expect(
        screen.queryByTestId('caption-edit-inline-textarea'),
      ).not.toBeInTheDocument()
    })
  })

  it('Cancel closes the inline editor without any draft PATCH', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    const [editCopy] = screen.getAllByRole('button', { name: /edit copy/i })
    fireEvent.click(editCopy)

    const cancel = screen.getByTestId('caption-edit-inline-cancel')
    fireEvent.click(cancel)

    expect(
      screen.queryByTestId('caption-edit-inline-textarea'),
    ).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('re-entering edit with a saved suggestion pre-fills the textarea', async () => {
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

    render(<ReviewSessionShell {...BASE_PROPS} initialItems={[initialItem]} />)

    const [editCopy] = screen.getAllByRole('button', { name: /edit copy/i })
    fireEvent.click(editCopy)

    const textarea = screen.getByTestId(
      'caption-edit-inline-textarea',
    ) as HTMLTextAreaElement
    expect(textarea.value).toBe('A prior suggestion')
  })

  it('clicking Approve clears a saved suggested caption (sends suggestedCaption: null)', async () => {
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

    render(<ReviewSessionShell {...BASE_PROPS} initialItems={[initialItem]} />)

    const [approve] = screen.getAllByRole('button', {
      name: /approve this post/i,
    })
    await act(async () => {
      fireEvent.click(approve)
    })

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(call[1].body)).toMatchObject({
      postId: 'post-1',
      decision: 'approved',
      suggestedCaption: null,
    })
  })
})

describe('ReviewSessionShell -- notes save state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)),
    )
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the note error state when the draft PATCH fails', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)
    const [ta] = screen.getAllByTestId('review-post-card-comment')

    fireEvent.change(ta, { target: { value: 'will fail' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    const [status] = screen.getAllByTestId('review-post-card-notes-status')
    expect(status).toHaveTextContent(/couldn.t save/i)
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
