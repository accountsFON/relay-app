import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { ReviewFeedbackRail } from '@/components/review/review-feedback-rail'
import type { FeedbackPostVM, FeedbackActions } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { HydratedThread } from '@/server/repositories/threads'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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

function makePostThread(id: string): HydratedThread {
  const comment = {
    id: `${id}-c1`,
    body: 'please soften',
    author: { kind: 'client' as const, reviewerName: 'Jane' },
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
    createdAt: new Date(),
  }
  return {
    id,
    status: 'open' as const,
    pin: { kind: 'post' as const },
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
      />,
    )
    expect(screen.queryByTestId('caption-diff-view')).toBeNull()
  })
})

describe('ReviewFeedbackRail — caption-edited block (anchor + accepted state)', () => {
  function renderRail(post: FeedbackPostVM, onSelectPost = vi.fn(), actions = noopActions) {
    render(
      <ReviewFeedbackRail
        posts={[post]}
        actions={actions}
        isDesigner={false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={onSelectPost}
        registerThreadRef={vi.fn()}
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
      />,
    )
    return { onSelectPost }
  }

  const editedVm = (over: Partial<FeedbackPostVM> = {}) =>
    vm({
      postId: 'post-1',
      verdict: 'caption_edited',
      caption: 'Old caption',
      suggestedCaption: 'New caption',
      reviewItemId: 'ri-1',
      threads: [],
      captionAccepted: false,
      ...over,
    })

  it('clicking the Copy edited block anchors the canvas to the post', () => {
    const { onSelectPost } = renderRail(editedVm())
    fireEvent.click(screen.getByTestId('rail-copy-edited-anchor-post-1'))
    expect(onSelectPost).toHaveBeenCalledWith('post-1')
  })

  it('clicking Accept does NOT anchor the canvas (separate from the block)', () => {
    const onSelectPost = vi.fn()
    const actions = { ...noopActions, acceptCaption: vi.fn(() => Promise.resolve()) }
    renderRail(editedVm(), onSelectPost, actions)
    fireEvent.click(screen.getByTestId('rail-accept-post-1'))
    expect(actions.acceptCaption).toHaveBeenCalledWith('ri-1')
    expect(onSelectPost).not.toHaveBeenCalled()
  })

  it('pending caption edit shows the diff plus Accept/Reject buttons', () => {
    renderRail(editedVm())
    expect(screen.getByTestId('caption-diff-view')).toBeInTheDocument()
    expect(screen.getByTestId('rail-accept-post-1')).toBeInTheDocument()
    expect(screen.getByTestId('rail-reject-post-1')).toBeInTheDocument()
    expect(screen.queryByTestId('rail-caption-accepted-post-1')).toBeNull()
  })

  it('accepted caption edit shows a greyed success state with no Accept/Reject buttons', () => {
    renderRail(editedVm({ captionAccepted: true, caption: 'New caption' }))
    const accepted = screen.getByTestId('rail-caption-accepted-post-1')
    expect(accepted).toBeInTheDocument()
    expect(accepted).toHaveTextContent('Caption accepted')
    expect(accepted).toHaveTextContent('New caption')
    expect(screen.queryByTestId('rail-accept-post-1')).toBeNull()
    expect(screen.queryByTestId('rail-reject-post-1')).toBeNull()
    expect(screen.queryByTestId('caption-diff-view')).toBeNull()
  })

  it('clicking the accepted success block still anchors the canvas', () => {
    const { onSelectPost } = renderRail(editedVm({ captionAccepted: true, caption: 'New caption' }))
    fireEvent.click(screen.getByTestId('rail-caption-accepted-post-1'))
    expect(onSelectPost).toHaveBeenCalledWith('post-1')
  })

  it('pressing Enter on the Copy edited block anchors the canvas', () => {
    const { onSelectPost } = renderRail(editedVm())
    fireEvent.keyDown(screen.getByTestId('rail-copy-edited-anchor-post-1'), { key: 'Enter' })
    expect(onSelectPost).toHaveBeenCalledWith('post-1')
  })

  it('pressing Space on the accepted success block anchors the canvas', () => {
    const { onSelectPost } = renderRail(editedVm({ captionAccepted: true, caption: 'New caption' }))
    fireEvent.keyDown(screen.getByTestId('rail-caption-accepted-post-1'), { key: ' ' })
    expect(onSelectPost).toHaveBeenCalledWith('post-1')
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
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
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
      />,
    )
    expect(screen.getByTestId('rail-mark-addressed-post-1')).toHaveTextContent('Move back')
  })
})

describe('ReviewFeedbackRail — Fix with AI (per post)', () => {
  function renderRail(post: FeedbackPostVM, isDesigner = false) {
    render(
      <ReviewFeedbackRail
        posts={[post]}
        actions={noopActions}
        isDesigner={isDesigner}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
      />,
    )
  }

  // Fix with AI was removed from the AM "View client feedback" rail (Julio:
  // it should not appear on this client-feedback surface). It must not render
  // for any verdict/thread combination here.
  it('never renders the Fix with AI button (removed from this surface)', () => {
    renderRail(vm({ postId: 'post-1', verdict: 'changes_requested', threads: [] }))
    expect(screen.queryByTestId('fix-with-ai-button')).toBeNull()
  })

  it('never renders Fix with AI for a caption_edited post', () => {
    renderRail(vm({ postId: 'post-1', verdict: 'caption_edited', suggestedCaption: 'x', reviewItemId: 'ri', threads: [] }))
    expect(screen.queryByTestId('fix-with-ai-button')).toBeNull()
  })

  it('never renders Fix with AI for a verdict=none post with an open thread', () => {
    renderRail(vm({ postId: 'post-1', verdict: 'none', threads: [makeThread('t1')] }))
    expect(screen.queryByTestId('fix-with-ai-button')).toBeNull()
  })
})

describe('ReviewFeedbackRail — general feedback reply (post-level)', () => {
  function renderRail(post: FeedbackPostVM, actions = noopActions, isDesigner = false) {
    render(
      <ReviewFeedbackRail
        posts={[post]}
        actions={actions}
        isDesigner={isDesigner}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
        onScrollToAnchor={vi.fn()}
        flagTotal={0}
        flagOpen={0}
        isImplementingRevisions={false}
        subStateAwaitingDesigner={false}
      />,
    )
  }

  it('renders the general-feedback opener with the Notes text when a post has a comment and no post-level thread', () => {
    renderRail(
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri1',
        threads: [],
      }),
    )
    const opener = screen.getByTestId('rail-general-feedback-post-1')
    expect(opener).toBeInTheDocument()
    expect(opener).toHaveTextContent('please soften')
    expect(screen.getByTestId('rail-general-feedback-input-post-1')).toBeInTheDocument()
    expect(screen.getByTestId('rail-general-feedback-send-post-1')).toBeInTheDocument()
  })

  it('typing + Send calls replyToFeedback with (reviewItemId, body)', () => {
    const replyToFeedback = vi.fn(() => Promise.resolve())
    renderRail(
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri1',
        threads: [],
      }),
      { ...noopActions, replyToFeedback },
    )
    fireEvent.change(screen.getByTestId('rail-general-feedback-input-post-1'), {
      target: { value: 'On it' },
    })
    fireEvent.click(screen.getByTestId('rail-general-feedback-send-post-1'))
    expect(replyToFeedback).toHaveBeenCalledWith('ri1', 'On it')
  })

  it('renders a post-level thread row (rail-postthread-<id>) and hides the opener once a post-level thread exists', () => {
    renderRail(
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri1',
        threads: [makePostThread('t1')],
      }),
    )
    expect(screen.getByTestId('rail-postthread-t1')).toBeInTheDocument()
    expect(screen.queryByTestId('rail-general-feedback-post-1')).toBeNull()
  })

  it('does not render the opener for a designer', () => {
    renderRail(
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri1',
        threads: [],
      }),
      noopActions,
      true,
    )
    expect(screen.queryByTestId('rail-general-feedback-post-1')).toBeNull()
  })

  it('numbers image-pin threads 1..N while a post-level thread gets a non-numeric label', () => {
    renderRail(
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri1',
        threads: [makeThread('t1'), makeThread('t2'), makePostThread('pt1')],
      }),
    )
    // Image pins keep their numeric rail-thread wrappers
    expect(screen.getByTestId('rail-thread-t1')).toBeInTheDocument()
    expect(screen.getByTestId('rail-thread-t2')).toBeInTheDocument()
    // Numeric pin labels reflect only the two image pins
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('3')).toBeNull()
    // Post-level thread renders in its own subsection, not numbered
    expect(screen.getByTestId('rail-postthread-pt1')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// New: ChangesNavigator + ResolveCheckbox + auto-address roll-up
// ---------------------------------------------------------------------------

function renderRailNew(
  posts: ReadonlyArray<FeedbackPostVM>,
  actionsOverride: Partial<FeedbackActions> = {},
  opts: { isDesigner?: boolean; selectedThreadId?: string | null } = {},
) {
  const actions = { ...noopActions, ...actionsOverride }
  render(
    <ReviewFeedbackRail
      posts={posts}
      actions={actions}
      isDesigner={opts.isDesigner ?? false}
      selectedPostId={null}
      selectedThreadId={opts.selectedThreadId ?? null}
      onToggleThread={vi.fn()}
      onSelectPost={vi.fn()}
      registerThreadRef={vi.fn()}
      onScrollToAnchor={vi.fn()}
      flagTotal={0}
      flagOpen={0}
      isImplementingRevisions={false}
      subStateAwaitingDesigner={false}
    />,
  )
  return { actions }
}

describe('ReviewFeedbackRail — ChangesNavigator', () => {
  it('renders the changes-navigator counter', () => {
    renderRailNew([vm()])
    expect(screen.getByTestId('changes-navigator-counter')).toBeInTheDocument()
  })
})

describe('ReviewFeedbackRail — note ResolveCheckbox', () => {
  it('renders the note checkbox when post has comment + reviewItemId (no post-level thread)', () => {
    renderRailNew([
      vm({ comment: 'please soften', reviewItemId: 'ri-1', threads: [makeThread('t1')] }),
    ])
    expect(screen.getByTestId('rail-note-resolve-post-1')).toBeInTheDocument()
  })

  it('clicking the note checkbox calls resolveNote(postId, reviewItemId)', async () => {
    const resolveNote = vi.fn(() => Promise.resolve())
    renderRailNew(
      [vm({ comment: 'please soften', reviewItemId: 'ri-1', threads: [makeThread('t1')], noteResolved: false })],
      { resolveNote },
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('rail-note-resolve-post-1'))
    })
    expect(resolveNote).toHaveBeenCalledWith('post-1', 'ri-1')
  })
})

describe('ReviewFeedbackRail — auto-address roll-up', () => {
  it('resolving the last open pin fires markAddressed', async () => {
    const resolve = vi.fn(() => Promise.resolve())
    const markAddressed = vi.fn(() => Promise.resolve())
    // ONE open pin, no comment, changes_requested
    const post = vm({ comment: null, threads: [makeThread('t1')], addressed: false })
    renderRailNew([post], { resolve, markAddressed }, { selectedThreadId: 't1' })

    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-comment-resolve-t1'))
    })
    expect(resolve).toHaveBeenCalledWith('t1')
    expect(markAddressed).toHaveBeenCalledWith('post-1', 'ri-1')
  })

  it('resolving one of two open pins does NOT fire markAddressed', async () => {
    const resolve = vi.fn(() => Promise.resolve())
    const markAddressed = vi.fn(() => Promise.resolve())
    const post = vm({ comment: null, threads: [makeThread('t1'), makeThread('t2')], addressed: false })
    renderRailNew([post], { resolve, markAddressed }, { selectedThreadId: 't1' })

    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-comment-resolve-t1'))
    })
    expect(resolve).toHaveBeenCalledWith('t1')
    expect(markAddressed).not.toHaveBeenCalled()
  })

  it('ticking the note when it is the last unresolved item fires resolveNote then markAddressed', async () => {
    const resolveNote = vi.fn(() => Promise.resolve())
    const markAddressed = vi.fn(() => Promise.resolve())
    // Zero open threads, unresolved comment → note is the ONLY remaining item
    const post = vm({
      comment: 'please soften',
      reviewItemId: 'ri-1',
      threads: [],
      noteResolved: false,
      addressed: false,
      verdict: 'changes_requested',
    })
    renderRailNew([post], { resolveNote, markAddressed })

    await act(async () => {
      fireEvent.click(screen.getByTestId('rail-note-resolve-post-1'))
    })
    expect(resolveNote).toHaveBeenCalledWith('post-1', 'ri-1')
    expect(markAddressed).toHaveBeenCalledWith('post-1', 'ri-1')
  })
})

describe('ReviewFeedbackRail — Changes only filter', () => {
  it('toggling the filter hides posts that need no changes', () => {
    const posts = [
      // approved-clean: no threads, no comment → needsChanges = false
      vm({ postId: 'post-approved', verdict: 'approved', threads: [], comment: null, addressed: false }),
      // changes_requested with open thread → needsChanges = true
      vm({ postId: 'post-changes', postNumber: 2, verdict: 'changes_requested', threads: [makeThread('t1')], addressed: false }),
    ]
    renderRailNew(posts)

    // Both rows visible before filter
    expect(screen.getByTestId('rail-row-post-approved')).toBeInTheDocument()
    expect(screen.getByTestId('rail-row-post-changes')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('changes-navigator-filter'))

    // Approved-clean row is removed
    expect(screen.queryByTestId('rail-row-post-approved')).toBeNull()
    // Changes row stays
    expect(screen.getByTestId('rail-row-post-changes')).toBeInTheDocument()
  })

  it('toggling the filter shrinks the navigator counter total (stepper only walks visible posts)', () => {
    // approved post with a RESOLVED thread: needsChanges=false (no open threads,
    // no changes verdict, no unresolved note) but contributes 1 navItem when
    // visiblePosts is unfiltered.  After Fix 1, the navItems list is built from
    // visiblePosts, so this post's navItem disappears when the filter is on.
    const resolvedThread: HydratedThread = {
      id: 't-resolved',
      status: 'resolved' as const,
      pin: { kind: 'image' as const, x: 5, y: 5 },
      firstComment: {
        id: 't-resolved-c1',
        body: 'old comment',
        author: { kind: 'client' as const, reviewerName: 'Jane' },
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
        createdAt: new Date(),
      },
      comments: [],
      commentCount: 1,
    }
    const posts = [
      vm({
        postId: 'post-approved-resolved',
        verdict: 'approved',
        threads: [resolvedThread],
        comment: null,
        addressed: false,
      }),
      vm({
        postId: 'post-changes-open',
        postNumber: 2,
        verdict: 'changes_requested',
        threads: [makeThread('t-open')],
        comment: null,
        addressed: false,
      }),
    ]
    renderRailNew(posts)

    // Before filter: 2 navItems (1 resolved thread + 1 open thread)
    // counter = "1 of 2 resolved"
    expect(screen.getByTestId('changes-navigator-counter')).toHaveTextContent('1 of 2 resolved')

    fireEvent.click(screen.getByTestId('changes-navigator-filter'))

    // After filter: approved post filtered out, only the open thread remains
    // counter = "0 of 1 resolved"
    expect(screen.getByTestId('changes-navigator-counter')).toHaveTextContent('0 of 1 resolved')
  })
})

// ---------------------------------------------------------------------------
// Designer flags — AM triage (flag toggles + send to designer)
// ---------------------------------------------------------------------------

describe('ReviewFeedbackRail — designer flags (AM triage)', () => {
  function renderFlags(
    posts: ReadonlyArray<FeedbackPostVM>,
    opts: {
      actions?: Partial<FeedbackActions>
      isDesigner?: boolean
      flagTotal?: number
      flagOpen?: number
      isImplementingRevisions?: boolean
      subStateAwaitingDesigner?: boolean
    } = {},
  ) {
    const actions = { ...noopActions, ...(opts.actions ?? {}) }
    render(
      <ReviewFeedbackRail
        posts={posts}
        actions={actions}
        isDesigner={opts.isDesigner ?? false}
        selectedPostId={null}
        selectedThreadId={null}
        onToggleThread={vi.fn()}
        onSelectPost={vi.fn()}
        registerThreadRef={vi.fn()}
        onScrollToAnchor={vi.fn()}
        flagTotal={opts.flagTotal ?? 0}
        flagOpen={opts.flagOpen ?? 0}
        isImplementingRevisions={opts.isImplementingRevisions ?? false}
        subStateAwaitingDesigner={opts.subStateAwaitingDesigner ?? false}
      />,
    )
    return { actions }
  }

  it('AM sees a flag toggle per client thread and on the post note', () => {
    renderFlags([
      vm({
        postId: 'post-1',
        verdict: 'changes_requested',
        comment: 'please soften',
        reviewItemId: 'ri-1',
        threads: [makeThread('t1'), makeThread('t2')],
      }),
    ])
    expect(screen.getByTestId('rail-flag-thread-t1-flag')).toBeInTheDocument()
    expect(screen.getByTestId('rail-flag-thread-t2-flag')).toBeInTheDocument()
    expect(screen.getByTestId('rail-flag-note-post-1-flag')).toBeInTheDocument()
  })

  it('the designer branch does not render the flag toggles or the send bar', () => {
    renderFlags(
      [
        vm({
          postId: 'post-1',
          verdict: 'changes_requested',
          comment: 'please soften',
          reviewItemId: 'ri-1',
          threads: [makeThread('t1')],
        }),
      ],
      { isDesigner: true },
    )
    expect(screen.queryByTestId('rail-flag-thread-t1-flag')).toBeNull()
    expect(screen.queryByTestId('rail-flag-note-post-1-flag')).toBeNull()
    expect(screen.queryByTestId('rail-send-to-designer')).toBeNull()
    expect(screen.queryByTestId('rail-flag-count')).toBeNull()
  })

  it('flagging a client thread calls flagForDesigner with { threadId }', () => {
    const flagForDesigner = vi.fn(() => Promise.resolve())
    renderFlags([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      actions: { flagForDesigner },
    })
    fireEvent.click(screen.getByTestId('rail-flag-thread-t1-flag'))
    expect(flagForDesigner).toHaveBeenCalledWith('post-1', { threadId: 't1' }, undefined)
  })

  it('an already-flagged thread shows the note input and unflag control', () => {
    renderFlags([
      vm({
        postId: 'post-1',
        threads: [makeThread('t1')],
        flags: [{ id: 'f1', threadId: 't1', reviewItemId: null, note: 'tighten it', done: false }],
      }),
    ])
    const note = screen.getByTestId('rail-flag-thread-t1-note') as HTMLInputElement
    expect(note.value).toBe('tighten it')
    expect(screen.getByTestId('rail-flag-thread-t1-unflag')).toBeInTheDocument()
  })

  it('send-to-designer is disabled when isImplementingRevisions=false', () => {
    renderFlags([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      isImplementingRevisions: false,
      flagTotal: 2,
    })
    expect(screen.getByTestId('rail-send-to-designer')).toBeDisabled()
  })

  it('send-to-designer is disabled when flagTotal=0', () => {
    renderFlags([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      isImplementingRevisions: true,
      flagTotal: 0,
    })
    expect(screen.getByTestId('rail-send-to-designer')).toBeDisabled()
    expect(screen.getByTestId('rail-flag-count')).toHaveTextContent(
      'No items flagged for designer',
    )
  })

  it('send-to-designer is enabled and fires sendToDesigner when the gate is met', () => {
    const sendToDesigner = vi.fn(() => Promise.resolve())
    renderFlags([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      actions: { sendToDesigner },
      isImplementingRevisions: true,
      flagTotal: 2,
      flagOpen: 2,
      subStateAwaitingDesigner: false,
    })
    const btn = screen.getByTestId('rail-send-to-designer')
    expect(btn).not.toBeDisabled()
    expect(screen.getByTestId('rail-flag-count')).toHaveTextContent('2 flagged for designer')
    fireEvent.click(btn)
    expect(sendToDesigner).toHaveBeenCalledOnce()
  })

  it('send-to-designer is disabled with a waiting hint when already awaiting the designer', () => {
    renderFlags([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      isImplementingRevisions: true,
      flagTotal: 2,
      subStateAwaitingDesigner: true,
    })
    const btn = screen.getByTestId('rail-send-to-designer')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('Sent, waiting on designer')
  })

  it('the caption-edit affordance does not get a flag toggle', () => {
    renderFlags([
      vm({
        postId: 'post-1',
        verdict: 'caption_edited',
        caption: 'old text',
        suggestedCaption: 'new text',
        reviewItemId: 'ri-1',
        threads: [],
      }),
    ])
    const block = screen.getByTestId('rail-copy-edited-anchor-post-1')
    expect(within(block).queryByText(/flag for designer/i)).toBeNull()
    // And no note-level flag toggle renders anywhere for a caption_edited post
    // (the caption edit is AM inline copy, not designer work).
    expect(screen.queryByTestId('rail-flag-note-post-1-flag')).toBeNull()
    expect(screen.queryByText(/flag for designer/i)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Designer read-only view + flagged task checklist + mark revisions done
// ---------------------------------------------------------------------------

function renderDesignerRail(
  posts: ReadonlyArray<FeedbackPostVM>,
  opts: {
    actions?: Partial<FeedbackActions>
    isDesigner?: boolean
    flagTotal?: number
    flagOpen?: number
    subStateAwaitingDesigner?: boolean
    selectedThreadId?: string | null
  } = {},
) {
  const actions = { ...noopActions, ...(opts.actions ?? {}) }
  render(
    <ReviewFeedbackRail
      posts={posts}
      actions={actions}
      isDesigner={opts.isDesigner ?? true}
      selectedPostId={null}
      selectedThreadId={opts.selectedThreadId ?? null}
      onToggleThread={vi.fn()}
      onSelectPost={vi.fn()}
      registerThreadRef={vi.fn()}
      onScrollToAnchor={vi.fn()}
      flagTotal={opts.flagTotal ?? 0}
      flagOpen={opts.flagOpen ?? 0}
      isImplementingRevisions={false}
      subStateAwaitingDesigner={opts.subStateAwaitingDesigner ?? false}
    />,
  )
  return { actions }
}

describe('ReviewFeedbackRail — designer read-only view', () => {
  it('does not render the comment composer inside an expanded pin row', () => {
    renderDesignerRail([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      selectedThreadId: 't1',
    })
    // The pin row itself (client feedback) stays visible for context...
    expect(screen.getByTestId('pin-comment-row-t1')).toBeInTheDocument()
    // ...but there is no composer to reply with.
    expect(screen.queryByTestId('pin-comment-input-t1')).toBeNull()
    expect(screen.queryByTestId('pin-comment-send-t1')).toBeNull()
  })

  it('does not render thread-resolve controls', () => {
    renderDesignerRail([vm({ postId: 'post-1', threads: [makeThread('t1')] })], {
      selectedThreadId: 't1',
    })
    expect(screen.queryByTestId('pin-comment-resolve-t1')).toBeNull()
  })

  it('does not render accept/reject, mark-addressed, or the note reply composer', () => {
    renderDesignerRail([
      vm({
        postId: 'post-1',
        verdict: 'caption_edited',
        caption: 'old text',
        suggestedCaption: 'new text',
        comment: 'please soften',
        reviewItemId: 'ri-1',
        threads: [makeThread('t1')],
      }),
    ])
    expect(screen.queryByTestId('rail-accept-post-1')).toBeNull()
    expect(screen.queryByTestId('rail-reject-post-1')).toBeNull()
    expect(screen.queryByTestId('rail-mark-addressed-post-1')).toBeNull()
    expect(screen.queryByTestId('rail-general-feedback-post-1')).toBeNull()
  })

  it('still shows posts and pin threads for context (read-only)', () => {
    renderDesignerRail([vm({ postId: 'post-1', threads: [makeThread('t1')] })])
    expect(screen.getByTestId('rail-row-post-1')).toBeInTheDocument()
    expect(screen.getByTestId('rail-thread-t1')).toBeInTheDocument()
  })
})

describe('ReviewFeedbackRail — designer flagged task checklist', () => {
  it('renders a done checkbox for a flagged thread and calls setFlagDone on tick', async () => {
    const setFlagDone = vi.fn(() => Promise.resolve())
    renderDesignerRail(
      [
        vm({
          postId: 'post-1',
          threads: [makeThread('t1')],
          flags: [{ id: 'flag-1', threadId: 't1', reviewItemId: null, note: 'tighten spacing', done: false }],
        }),
      ],
      { actions: { setFlagDone } },
    )
    const cb = screen.getByTestId('designer-flag-flag-1')
    expect(cb).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(cb)
    })
    expect(setFlagDone).toHaveBeenCalledWith('flag-1')
  })

  it('renders a done checkbox for a flagged note and calls unsetFlagDone when already done', async () => {
    const unsetFlagDone = vi.fn(() => Promise.resolve())
    renderDesignerRail(
      [
        vm({
          postId: 'post-1',
          verdict: 'changes_requested',
          reviewItemId: 'ri-1',
          threads: [],
          flags: [{ id: 'flag-note', threadId: null, reviewItemId: 'ri-1', note: 'redo layout', done: true }],
        }),
      ],
      { actions: { unsetFlagDone } },
    )
    const cb = screen.getByTestId('designer-flag-flag-note')
    expect(cb).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(cb)
    })
    expect(unsetFlagDone).toHaveBeenCalledWith('flag-note')
  })

  it('does not render a done checkbox for a non-flagged thread', () => {
    renderDesignerRail([vm({ postId: 'post-1', threads: [makeThread('t1')], flags: [] })])
    expect(screen.queryByTestId('designer-flag-flag-1')).toBeNull()
  })

  it('does not render the designer task checkbox in the AM branch', () => {
    renderDesignerRail(
      [
        vm({
          postId: 'post-1',
          threads: [makeThread('t1')],
          flags: [{ id: 'flag-1', threadId: 't1', reviewItemId: null, note: 'tighten spacing', done: false }],
        }),
      ],
      { isDesigner: false },
    )
    expect(screen.queryByTestId('designer-flag-flag-1')).toBeNull()
  })
})

describe('ReviewFeedbackRail — designer mark revisions done', () => {
  it('is hidden when subStateAwaitingDesigner is false', () => {
    renderDesignerRail([vm()], { flagTotal: 1, flagOpen: 0, subStateAwaitingDesigner: false })
    expect(screen.queryByTestId('rail-mark-revisions-done')).toBeNull()
  })

  it('is visible but disabled when flags are still open', () => {
    renderDesignerRail([vm()], { flagTotal: 2, flagOpen: 1, subStateAwaitingDesigner: true })
    expect(screen.getByTestId('rail-mark-revisions-done')).toBeDisabled()
  })

  it('is disabled when there are no flags at all', () => {
    renderDesignerRail([vm()], { flagTotal: 0, flagOpen: 0, subStateAwaitingDesigner: true })
    expect(screen.getByTestId('rail-mark-revisions-done')).toBeDisabled()
  })

  it('is enabled and fires markRevisionsDone when every flag is done', async () => {
    const markRevisionsDone = vi.fn(() => Promise.resolve())
    renderDesignerRail([vm()], {
      actions: { markRevisionsDone },
      flagTotal: 2,
      flagOpen: 0,
      subStateAwaitingDesigner: true,
    })
    const btn = screen.getByTestId('rail-mark-revisions-done')
    expect(btn).not.toBeDisabled()
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(markRevisionsDone).toHaveBeenCalledOnce()
  })

  it('never renders in the AM branch even while awaiting the designer', () => {
    renderDesignerRail([vm()], {
      isDesigner: false,
      flagTotal: 2,
      flagOpen: 0,
      subStateAwaitingDesigner: true,
    })
    expect(screen.queryByTestId('rail-mark-revisions-done')).toBeNull()
  })
})
