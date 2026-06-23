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
    // Non-image pin so the canvas renders a clickable canvas-pin-<id> chip
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
    reviewItemId: 'ri-1',
    addressed: false,
    threads: [makeThread('t1')],
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
  startNextRound: vi.fn(() => Promise.resolve()),
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewFeedbackShell — zone rendering', () => {
  it('renders all three zones: rail, canvas, and internal thread', () => {
    render(
      <ReviewFeedbackShell
        posts={[vm()]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
        allAddressed={false}
        isSuperseded={false}
      />,
    )

    expect(screen.getByTestId('review-feedback-rail')).toBeTruthy()
    expect(screen.getByTestId('review-posts-canvas')).toBeTruthy()
    // Internal thread is rendered inside the internal rail aside
    const internalRail = screen.getByTestId('review-internal-rail')
    expect(internalRail).toBeTruthy()
    expect(internalRail.querySelector('[data-testid="internal-thread-stub"]')).toBeTruthy()
  })
})

describe('ReviewFeedbackShell — canvas pin → rail scroll', () => {
  it('clicking canvas-pin-t1 propagates selection so rail-thread-t1 is visible', () => {
    render(
      <ReviewFeedbackShell
        posts={[vm()]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
        allAddressed={false}
        isSuperseded={false}
      />,
    )

    // Click the non-image pin chip on the canvas
    const pinChip = screen.getByTestId('canvas-pin-t1')
    fireEvent.click(pinChip)

    // After selection, the rail should show the thread body
    expect(screen.getByTestId('rail-thread-t1')).toBeTruthy()
    // scrollIntoView should have been called (rail scroll to the selected row)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('ReviewFeedbackShell — rail row → canvas scroll', () => {
  it('clicking rail-row-p1 sets canvas-post-p1 data-selected="true"', () => {
    render(
      <ReviewFeedbackShell
        posts={[vm()]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
        allAddressed={false}
        isSuperseded={false}
      />,
    )

    // Before click, canvas post is not selected
    const canvasPost = screen.getByTestId('canvas-post-p1')
    expect(canvasPost.getAttribute('data-selected')).toBe('false')

    // Click the rail row
    fireEvent.click(screen.getByTestId('rail-row-p1'))

    // After click, canvas post should be selected
    expect(canvasPost.getAttribute('data-selected')).toBe('true')
    // scrollIntoView should have been called (canvas scroll to the selected post)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe('ReviewFeedbackShell — startNextRoundSlot', () => {
  it('renders startNextRoundSlot above rail when allAddressed && !isSuperseded', () => {
    render(
      <ReviewFeedbackShell
        posts={[vm({ addressed: true })]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
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
        posts={[vm({ addressed: true })]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
        allAddressed={true}
        isSuperseded={true}
        startNextRoundSlot={<div data-testid="next-round-slot" />}
      />,
    )
    expect(screen.queryByTestId('next-round-slot')).toBeNull()
  })
})
