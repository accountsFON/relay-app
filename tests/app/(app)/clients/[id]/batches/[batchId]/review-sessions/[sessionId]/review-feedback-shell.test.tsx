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

describe('ReviewFeedbackShell — canvas pin → rail expand', () => {
  it('clicking canvas-pin-t1 expands the matching pin row in the rail', () => {
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

    // Before click, pin row is collapsed
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('false')

    // Click the non-image pin chip on the canvas
    const pinChip = screen.getByTestId('canvas-pin-t1')
    fireEvent.click(pinChip)

    // After click, pin row should be expanded
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')

    // scrollIntoView should have been called (scroll to the thread ref)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('clicking a second canvas-pin collapses the first and expands the second', () => {
    const thread2 = makeThread('t2')
    render(
      <ReviewFeedbackShell
        posts={[vm({ threads: [makeThread('t1'), thread2] })]}
        actions={noopActions}
        role="am"
        isDesigner={false}
        canPostComment={true}
        internalThread={<div data-testid="internal-thread-stub" />}
        allAddressed={false}
        isSuperseded={false}
      />,
    )

    fireEvent.click(screen.getByTestId('canvas-pin-t1'))
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('pin-comment-row-t2').getAttribute('data-expanded')).toBe('false')

    fireEvent.click(screen.getByTestId('canvas-pin-t2'))
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('false')
    expect(screen.getByTestId('pin-comment-row-t2').getAttribute('data-expanded')).toBe('true')
  })
})

describe('ReviewFeedbackShell — toggle collapses an expanded pin row', () => {
  it('clicking an expanded pin row header collapses it', () => {
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

    // Expand via canvas pin
    fireEvent.click(screen.getByTestId('canvas-pin-t1'))
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

    const canvasPost = screen.getByTestId('canvas-post-p1')
    expect(canvasPost.getAttribute('data-selected')).toBe('false')
  })

  it('clicking canvas-pin-t1 sets canvas-post-p1 data-selected="true"', () => {
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

    fireEvent.click(screen.getByTestId('canvas-pin-t1'))
    expect(screen.getByTestId('canvas-post-p1').getAttribute('data-selected')).toBe('true')
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
