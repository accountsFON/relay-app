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
  it('renders one row per post in order', () => {
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    const row = screen.getByTestId('rail-row-post-a').closest('[data-collapsed]')
    expect(row?.getAttribute('data-collapsed')).toBe('false')
  })
})

describe('ReviewFeedbackRail — row selection', () => {
  it('clicking a changes row calls onSelectRow with that postId', () => {
    const onSelectRow = vi.fn()
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onSelectRow={onSelectRow}
        registerRef={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('rail-row-post-1'))
    expect(onSelectRow).toHaveBeenCalledWith('post-1')
  })

  it('the expanded body shows the thread wrapper', () => {
    const posts = [vm({ postId: 'post-1', verdict: 'changes_requested', threads: [makeThread('t1')] })]
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={noopActions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-thread-t1')).toBeTruthy()
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-accept-post-1')).toBeTruthy()
    expect(screen.getByTestId('rail-reject-post-1')).toBeTruthy()
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
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
        onSelectRow={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('rail-mark-addressed-post-1')).toHaveTextContent('Move back')
  })
})
