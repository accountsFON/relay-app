import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewFeedbackShell } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-shell'
import type {
  FeedbackPostVM,
  FeedbackActions,
} from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { HydratedThread } from '@/server/repositories/threads'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeThread(id: string): HydratedThread {
  const comment = {
    id: `${id}-c1`,
    body: 'Please fix this',
    author: { kind: 'client' as const, reviewerName: 'Jane' },
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
    createdAt: new Date(),
  }
  return {
    id,
    status: 'open' as const,
    // Post-level pin — renders as instagram-post-pin badge (or fb-pin-badge)
    // in the faithful post component, accessible via data-thread-id attribute.
    pin: { kind: 'post' as const },
    firstComment: comment,
    comments: [comment],
    commentCount: 1,
  }
}

function vm(over: Partial<FeedbackPostVM> = {}): FeedbackPostVM {
  return {
    postId: 'p1',
    postNumber: 1,
    caption: 'Hello world',
    mediaUrls: [],
    postDate: '2026-06-01',
    verdict: 'changes_requested',
    suggestedCaption: null,
    comment: null,
    reviewItemId: 'ri-1',
    addressed: false,
    captionAccepted: false,
    noteResolved: false,
    threads: [makeThread('t1')],
    flags: [],
    ...over,
  }
}

const noopActions: FeedbackActions = {
  comment: vi.fn(() => Promise.resolve()),
  resolve: vi.fn(() => Promise.resolve()),
  useAsPostImage: vi.fn(() => Promise.resolve()),
  acceptCaption: vi.fn(() => Promise.resolve()),
  rejectCaption: vi.fn(() => Promise.resolve()),
  markAddressed: vi.fn(() => Promise.resolve()),
  unmarkAddressed: vi.fn(() => Promise.resolve()),
  resolveNote: vi.fn(() => Promise.resolve()),
  unresolveNote: vi.fn(() => Promise.resolve()),
  replyToFeedback: vi.fn(() => Promise.resolve()),
  startNextRound: vi.fn(() => Promise.resolve()),
  flagForDesigner: vi.fn(() => Promise.resolve()),
  unflagForDesigner: vi.fn(() => Promise.resolve()),
  sendToDesigner: vi.fn(() => Promise.resolve()),
  setFlagDone: vi.fn(() => Promise.resolve()),
  unsetFlagDone: vi.fn(() => Promise.resolve()),
  markRevisionsDone: vi.fn(() => Promise.resolve()),
}

/** Required props for every shell render. clientName is now required. */
const baseProps = {
  actions: noopActions,
  role: 'am' as const,
  isDesigner: false,
  canPostComment: true,
  allAddressed: false,
  isSuperseded: false,
  clientName: 'Acme Corp',
  clientAvatarUrl: null,
  flagTotal: 0,
  flagOpen: 0,
  isImplementingRevisions: false,
  subStateAwaitingDesigner: false,
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ---------------------------------------------------------------------------
// Helper: find the post-level pin badge rendered by the faithful post
// InstagramFeedPost renders post-level pins as [data-testid="instagram-post-pin"]
// with [data-thread-id=<id>]. This locator searches within the full document
// since the badge is nested inside the post component.
// ---------------------------------------------------------------------------

function findPostPinBadge(threadId: string) {
  return document.querySelector(
    `[data-testid="instagram-post-pin"][data-thread-id="${threadId}"]`,
  ) as HTMLElement | null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewFeedbackShell — zone rendering', () => {
  it('renders the two zones: feedback rail and posts canvas (no fixed chat rail)', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    expect(screen.getByTestId('review-feedback-rail')).toBeTruthy()
    expect(screen.getByTestId('review-posts-canvas')).toBeTruthy()
    // The internal chat is no longer a fixed right rail; it's a toggle popup
    // (MobileThreadFab with showOnDesktop), rendered by the page, not the shell.
    expect(screen.queryByTestId('review-internal-rail')).toBeNull()
  })

  it('renders the PlatformToggle above the canvas', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )
    // PlatformToggle renders a radiogroup labelled "Preview platform"
    expect(screen.getByRole('radiogroup', { name: 'Preview platform' })).toBeTruthy()
  })

  it('P2 #29: shows an empty state (and no rail/canvas) when there are no posts', () => {
    render(<ReviewFeedbackShell {...baseProps} posts={[]} />)
    expect(screen.getByTestId('feedback-empty')).toBeTruthy()
    expect(screen.getByText(/no changes to work on/i)).toBeTruthy()
    expect(screen.queryByTestId('review-feedback-rail')).toBeNull()
    expect(screen.queryByTestId('review-posts-canvas')).toBeNull()
  })
})

describe('ReviewFeedbackShell — canvas pin → rail expand', () => {
  it('clicking canvas instagram-post-pin expands the matching pin row in the rail', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    // Before click, pin row is collapsed
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('false')

    // Click the post-level pin badge rendered by InstagramFeedPost
    const pinBadge = findPostPinBadge('t1')
    expect(pinBadge).toBeTruthy()
    fireEvent.click(pinBadge!)

    // After click, pin row should be expanded
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')

    // scrollIntoView should have been called (scroll to the thread ref in rail)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('clicking a second canvas-pin collapses the first and expands the second', () => {
    const thread2 = makeThread('t2')
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm({ threads: [makeThread('t1'), thread2] })]}
      />,
    )

    const pin1 = findPostPinBadge('t1')
    const pin2 = findPostPinBadge('t2')
    expect(pin1).toBeTruthy()
    expect(pin2).toBeTruthy()

    fireEvent.click(pin1!)
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('pin-comment-row-t2').getAttribute('data-expanded')).toBe('false')

    fireEvent.click(pin2!)
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('false')
    expect(screen.getByTestId('pin-comment-row-t2').getAttribute('data-expanded')).toBe('true')
  })
})

describe('ReviewFeedbackShell — rail → canvas scroll', () => {
  it('clicking a rail pin row calls scrollIntoView on the matching canvas post', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    // pin-comment-row-t1 is the rail row header; clicking it calls toggleThread
    // which should scroll the canvas to canvas-post-p1
    fireEvent.click(screen.getByTestId('pin-comment-row-t1'))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    // After click, canvas-post-p1 should be marked selected
    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('true')
  })

  it('clicking a post header anchors the canvas to that post (selectPost)', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    // The post header (rail-row-p1) anchors the canvas even for posts without
    // an expanded pin interaction (e.g. copy-change posts with no pins).
    fireEvent.click(screen.getByTestId('rail-row-p1'))

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('true')
  })

  it('toggleThread sets selectedPostId so canvas-post-p1 becomes selected', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('false')

    fireEvent.click(screen.getByTestId('pin-comment-row-t1'))

    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('true')
  })
})

describe('ReviewFeedbackShell — toggle collapses an expanded pin row', () => {
  it('clicking an expanded pin row header collapses it', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    // Expand via canvas pin badge
    const pinBadge = findPostPinBadge('t1')
    fireEvent.click(pinBadge!)
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')

    // Toggle off by clicking the pin row header
    fireEvent.click(screen.getByTestId('pin-comment-row-t1'))
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('false')
  })
})

describe('ReviewFeedbackShell — canvas post selection', () => {
  it('canvas-post-p1 has data-selected="false" initially', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    const canvasPost = screen.getByTestId('canvas-post-p1')
    expect(canvasPost.getAttribute('data-selected')).toBe('false')
  })

  it('clicking a canvas pin badge sets canvas-post-p1 data-selected="true"', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm()]}
      />,
    )

    const pinBadge = findPostPinBadge('t1')
    fireEvent.click(pinBadge!)
    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('true')
  })
})

describe('ReviewFeedbackShell — startNextRoundSlot', () => {
  it('renders startNextRoundSlot above rail when allAddressed && !isSuperseded', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm({ addressed: true })]}
        allAddressed={true}
        isSuperseded={false}
        startNextRoundSlot={<div data-testid="next-round-slot" />}
      />,
    )
    expect(screen.getByTestId('next-round-slot')).toBeTruthy()
  })

  it('does NOT render startNextRoundSlot when isSuperseded', () => {
    render(
      <ReviewFeedbackShell
        {...baseProps}
        posts={[vm({ addressed: true })]}
        allAddressed={true}
        isSuperseded={true}
        startNextRoundSlot={<div data-testid="next-round-slot" />}
      />,
    )
    expect(screen.queryByTestId('next-round-slot')).toBeNull()
  })
})
