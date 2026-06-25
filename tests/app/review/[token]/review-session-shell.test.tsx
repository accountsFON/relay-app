import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import {
  ReviewSessionShell,
  type ReviewSessionShellPost,
} from '@/app/review/[token]/review-session-shell'
import { submitSessionAction } from '@/server/actions/reviewSessions'
import type { ReviewItemHydrated } from '@/types/review-session'

// Stub Next router. The shell only uses `router.refresh()` in failure paths;
// resolved fetches never hit it, so a no-op is fine.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// submitSessionAction is stubbed so tests can drive its resolve/reject.
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

describe('ReviewSessionShell -- approve all', () => {
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

  function item(
    postId: string,
    decision: ReviewItemHydrated['decision'],
  ): ReviewItemHydrated {
    return {
      id: `item-${postId}`,
      postId,
      decision,
      comment: null,
      suggestedCaption: null,
      acceptedAsPostVersionId: null,
      addressedAt: null,
      updatedSinceLastReview: false,
      lastReviewedVersionId: null,
      reviewedAt: new Date(),
    }
  }

  it('approves every post when none have feedback, with no confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<ReviewSessionShell {...BASE_PROPS} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-all-button'))
    })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    const bodies = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.parse(c[1].body),
    )
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postId: 'post-1', decision: 'approved', suggestedCaption: null }),
        expect.objectContaining({ postId: 'post-2', decision: 'approved', suggestedCaption: null }),
      ]),
    )
    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('confirms before overriding a Changes post and aborts on dismiss', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <ReviewSessionShell
        {...BASE_PROPS}
        initialItems={[item('post-1', 'changes_requested')]}
      />,
    )

    fireEvent.click(screen.getByTestId('approve-all-button'))

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('skips posts already approved (no redundant PATCH)', async () => {
    render(
      <ReviewSessionShell
        {...BASE_PROPS}
        initialItems={[item('post-1', 'approved')]}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-all-button'))
    })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    )
    expect(body.postId).toBe('post-2')
  })

  it('re-approves an already-approved post that still has a pending suggested caption, to clear it', async () => {
    render(
      <ReviewSessionShell
        {...BASE_PROPS}
        initialItems={[{ ...item('post-1', 'approved'), suggestedCaption: 'pending edit' }]}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('approve-all-button'))
    })

    // post-1 is approved but still carries a suggestion, so it is NOT skipped:
    // it is PATCHed with suggestedCaption: null to clear it (alongside post-2).
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    const bodies = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      JSON.parse(c[1].body),
    )
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postId: 'post-1', decision: 'approved', suggestedCaption: null }),
        expect.objectContaining({ postId: 'post-2', decision: 'approved', suggestedCaption: null }),
      ]),
    )
  })

  it('disables the button when all posts are already approved', () => {
    render(
      <ReviewSessionShell
        {...BASE_PROPS}
        initialItems={[item('post-1', 'approved'), item('post-2', 'approved')]}
      />,
    )
    expect(screen.getByTestId('approve-all-button')).toBeDisabled()
  })
})

describe('ReviewSessionShell -- sticky condensed bar', () => {
  let ioCallback: (entries: Array<{ isIntersecting: boolean }>) => void

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)))
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
          ioCallback = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the sticky bar only after the top card scrolls out of view', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    expect(screen.queryByTestId('review-sticky-bar')).not.toBeInTheDocument()

    await act(async () => {
      ioCallback([{ isIntersecting: false }])
    })
    expect(screen.getByTestId('review-sticky-bar')).toBeInTheDocument()

    await act(async () => {
      ioCallback([{ isIntersecting: true }])
    })
    expect(screen.queryByTestId('review-sticky-bar')).not.toBeInTheDocument()
  })
})

describe('ReviewSessionShell -- submit error surfacing', () => {
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

  it('shows an error and keeps the modal open when submit throws', async () => {
    vi.mocked(submitSessionAction).mockRejectedValueOnce(
      new Error('No active session to submit'),
    )
    render(<ReviewSessionShell {...BASE_PROPS} />)

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    expect(screen.getByTestId('submit-review-modal')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-review-modal-confirm'))
    })

    // Error is visible to the reviewer and the modal stays open to retry.
    expect(
      await screen.findByTestId('submit-review-modal-error'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('submit-review-modal')).toBeInTheDocument()
  })

  it('closes the modal to the thanks screen on a successful submit', async () => {
    vi.mocked(submitSessionAction).mockResolvedValueOnce({
      ok: true,
      summary: {
        approved: 2,
        changesRequested: 0,
        captionEdited: 0,
        totalPosts: 2,
      },
    } as Awaited<ReturnType<typeof submitSessionAction>>)
    render(<ReviewSessionShell {...BASE_PROPS} />)

    fireEvent.click(screen.getByTestId('submit-review-bar-button'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('submit-review-modal-confirm'))
    })

    await waitFor(() =>
      expect(screen.queryByTestId('submit-review-modal')).not.toBeInTheDocument(),
    )
  })
})

describe('ReviewSessionShell -- draft save error surfacing', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows a save-error alert when a decision PATCH fails (e.g. 404)', async () => {
    render(<ReviewSessionShell {...BASE_PROPS} />)

    const [approve] = screen.getAllByRole('button', {
      name: /approve this post/i,
    })
    await act(async () => {
      fireEvent.click(approve)
    })

    expect(await screen.findByTestId('review-save-error')).toBeInTheDocument()
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

describe('ReviewSessionShell -- locked conversation after submit', () => {
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

  it('submitted: renders the locked conversation feed (not a dead-end thanks screen)', () => {
    render(<ReviewSessionShell {...BASE_PROPS} sessionStatus="submitted" />)

    // The feed still renders both post cards.
    expect(screen.getAllByTestId('review-post-card')).toHaveLength(2)
    // The submitted/discussion banner shows.
    expect(screen.getByTestId('review-submitted-banner')).toBeInTheDocument()
    // The submit bar is gone.
    expect(screen.queryByTestId('review-submit-bar')).toBeNull()
  })
})

describe('ReviewSessionShell -- new reply badge', () => {
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

  it('renders the new-reply badge only on posts flagged hasNewReply', () => {
    const posts: ReviewSessionShellPost[] = [
      { ...makePost('post-1', 'Caption 1'), hasNewReply: true },
      makePost('post-2', 'Caption 2'),
    ]
    render(<ReviewSessionShell {...BASE_PROPS} posts={posts} />)
    expect(screen.getAllByTestId('new-reply-badge')).toHaveLength(1)
  })
})
