import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewFeedbackRail } from '@/components/review/review-feedback-rail'
import type { FeedbackPostVM, FeedbackActions } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { HydratedThread } from '@/server/repositories/threads'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeThread(id: string): HydratedThread {
  const comment = {
    id: `${id}-c1`,
    body: 'Please fix the spacing',
    author: { kind: 'client' as const, reviewerName: 'Jane' },
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
    createdAt: new Date(),
  }
  return {
    id,
    status: 'open' as const,
    pin: { kind: 'image' as const, x: 10, y: 20 },
    firstComment: comment,
    comments: [comment],
    commentCount: 1,
  }
}

function vm(over: Partial<FeedbackPostVM> = {}): FeedbackPostVM {
  return {
    postId: 'post-1',
    postNumber: 1,
    caption: 'Hello world',
    mediaUrls: ['https://example.com/img.jpg'],
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
// Tests
// ---------------------------------------------------------------------------

describe('ReviewFeedbackRail — row rendering', () => {
  it('renders one post header per post in order', () => {
    const posts = [
      vm({ postId: 'post-1', postNumber: 1 }),
      vm({ postId: 'post-2', postNumber: 2, verdict: 'approved', threads: [] }),
      vm({ postId: 'post-3', postNumber: 3, verdict: 'changes_requested', threads: [makeThread('t3')] }),
    ]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-row-post-1')).toBeTruthy()
    expect(screen.getByTestId('rail-row-post-2')).toBeTruthy()
    expect(screen.getByTestId('rail-row-post-3')).toBeTruthy()
  })

  it('marks an approved-clean post row as data-collapsed="true"', () => {
    const posts = [
      vm({ postId: 'post-clean', verdict: 'approved', threads: [] }),
      vm({ postId: 'post-dirty', verdict: 'changes_requested', threads: [makeThread('t1')] }),
    ]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    const cleanRow = screen.getByTestId('rail-row-post-clean').closest('[data-collapsed]')
    expect(cleanRow?.getAttribute('data-collapsed')).toBe('true')

    const dirtyRow = screen.getByTestId('rail-row-post-dirty').closest('[data-collapsed]')
    expect(dirtyRow?.getAttribute('data-collapsed')).toBe('false')
  })

  it('approved post with threads is NOT collapsed', () => {
    const posts = [vm({ postId: 'post-a', verdict: 'approved', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    const row = screen.getByTestId('rail-row-post-a').closest('[data-collapsed]')
    expect(row?.getAttribute('data-collapsed')).toBe('false')
  })

  it('renders a rail-thread-<id> wrapper for each thread in a post', () => {
    const posts = [
      vm({
        postId: 'post-1',
        threads: [makeThread('t1'), makeThread('t2')],
      }),
    ]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-thread-t1')).toBeTruthy()
    expect(screen.getByTestId('rail-thread-t2')).toBeTruthy()
  })
})

describe('ReviewFeedbackRail — pin row expansion', () => {
  it('pin row is collapsed by default (data-expanded="false")', () => {
    const posts = [vm({ postId: 'post-1', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    const row = screen.getByTestId('pin-comment-row-t1')
    expect(row.getAttribute('data-expanded')).toBe('false')
  })

  it('pin row is expanded when selectedThreadId matches', () => {
    const posts = [vm({ postId: 'post-1', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId="t1"
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    const row = screen.getByTestId('pin-comment-row-t1')
    expect(row.getAttribute('data-expanded')).toBe('true')
  })

  it('clicking a pin row header calls onToggleThread with that threadId', () => {
    const onToggleThread = vi.fn()
    const posts = [vm({ postId: 'post-1', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={onToggleThread}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('pin-comment-row-t1'))
    expect(onToggleThread).toHaveBeenCalledWith('t1')
  })

  it('clicking a post header calls onSelectPost (anchors the canvas, incl. copy-change posts with no pins)', () => {
    const onSelectPost = vi.fn()
    const posts = [
      vm({
        postId: 'post-ce',
        verdict: 'caption_edited',
        caption: 'old text',
        suggestedCaption: 'new text',
        reviewItemId: 'item-ce',
        threads: [],
      }),
    ]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={onSelectPost}
        registerThreadRef={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('rail-row-post-ce'))
    expect(onSelectPost).toHaveBeenCalledWith('post-ce')
  })

  it('a second pin row is collapsed while first is expanded', () => {
    const posts = [
      vm({
        postId: 'post-1',
        threads: [makeThread('t1'), makeThread('t2')],
      }),
    ]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId="t1"
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-row-t1').getAttribute('data-expanded')).toBe('true')
    expect(screen.getByTestId('pin-comment-row-t2').getAttribute('data-expanded')).toBe('false')
  })
})

describe('ReviewFeedbackRail — isDesigner hides AM-only controls', () => {
  it('hides mark-addressed button when isDesigner=true', () => {
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')], addressed: false })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={true}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('rail-mark-addressed-post-1')).toBeNull()
  })

  it('shows mark-addressed button when isDesigner=false', () => {
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')], addressed: false })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-mark-addressed-post-1')).toBeTruthy()
  })

  it('hides Accept/Reject caption buttons when isDesigner=true', () => {
    const posts = [vm({
      postId: 'post-1',
      verdict: 'caption_edited',
      suggestedCaption: 'New caption here',
      reviewItemId: 'ri-1',
      threads: [],
    })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={true}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('rail-accept-post-1')).toBeNull()
    expect(screen.queryByTestId('rail-reject-post-1')).toBeNull()
  })

  it('shows Accept/Reject buttons when isDesigner=false and verdict is caption_edited', () => {
    const posts = [vm({
      postId: 'post-1',
      verdict: 'caption_edited',
      suggestedCaption: 'New caption here',
      reviewItemId: 'ri-1',
      threads: [],
    })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-accept-post-1')).toBeTruthy()
    expect(screen.getByTestId('rail-reject-post-1')).toBeTruthy()
  })

  it('designer does not see resolve button inside expanded pin row', () => {
    const posts = [vm({ postId: 'post-1', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={true}
        selectedPostId={null}
        selectedThreadId="t1"
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('pin-comment-resolve-t1')).toBeNull()
  })
})

describe('ReviewFeedbackRail — caption_edited diff view', () => {
  it('renders caption-diff-view and copy-edited label for caption_edited post (AM view)', () => {
    const posts = [vm({
      postId: 'post-ce',
      verdict: 'caption_edited',
      caption: 'old text',
      suggestedCaption: 'new text',
      reviewItemId: 'ri-ce',
      threads: [],
    })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('caption-diff-view')).toBeTruthy()
    expect(screen.getByTestId('rail-copy-edited-label-post-ce')).toBeTruthy()
    expect(screen.getByTestId('rail-accept-post-ce')).toBeTruthy()
    expect(screen.getByTestId('rail-reject-post-ce')).toBeTruthy()
  })

  it('does not render caption-diff-view for a non-caption_edited post', () => {
    const posts = [vm({
      postId: 'post-cr',
      verdict: 'changes_requested',
      caption: 'original caption',
      suggestedCaption: null,
      threads: [makeThread('t1')],
    })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('caption-diff-view')).toBeNull()
  })
})

describe('ReviewFeedbackRail — mark addressed toggle', () => {
  it('shows "Mark addressed" label when post.addressed is false', () => {
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')], addressed: false })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-mark-addressed-post-1')).toHaveTextContent('Mark addressed')
  })

  it('shows "Move back" label when post.addressed is true', () => {
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')], addressed: true })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-mark-addressed-post-1')).toHaveTextContent('Move back')
  })
})
