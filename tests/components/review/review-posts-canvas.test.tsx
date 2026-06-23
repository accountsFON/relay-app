import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewPostsCanvas } from '@/components/review/review-posts-canvas'
import type { FeedbackPostVM } from '@/app/(app)/clients/[id]/batches/[batchId]/review-sessions/[sessionId]/review-feedback-types'
import type { HydratedThread } from '@/server/repositories/threads'

function imageThread(id: string, status: 'open' | 'resolved' = 'open'): HydratedThread {
  return {
    id,
    status,
    pin: { kind: 'image', x: 30, y: 40 },
    firstComment: {
      id: `${id}-c1`,
      author: { kind: 'client', reviewerName: 'Jane' },
      body: 'fix the logo',
      createdAt: new Date(),
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    },
    comments: [
      {
        id: `${id}-c1`,
        author: { kind: 'client', reviewerName: 'Jane' },
        body: 'fix the logo',
        createdAt: new Date(),
      },
    ],
    commentCount: 1,
  }
}

function captionThread(id: string): HydratedThread {
  return {
    id,
    status: 'open',
    pin: { kind: 'caption', from: 0, to: 5 },
    firstComment: {
      id: `${id}-c1`,
      author: { kind: 'client', reviewerName: 'Jane' },
      body: 'too long',
      createdAt: new Date(),
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
    },
    comments: [
      {
        id: `${id}-c1`,
        author: { kind: 'client', reviewerName: 'Jane' },
        body: 'too long',
        createdAt: new Date(),
      },
    ],
    commentCount: 1,
  }
}

function vm(overrides: Partial<FeedbackPostVM> = {}): FeedbackPostVM {
  return {
    postId: 'p1',
    postNumber: 1,
    caption: 'Test caption',
    mediaUrls: ['https://example.com/image.jpg'],
    postDate: '2026-06-01T00:00:00.000Z',
    verdict: 'none',
    suggestedCaption: null,
    reviewItemId: null,
    addressed: false,
    threads: [imageThread('t1')],
    ...overrides,
  }
}

describe('ReviewPostsCanvas', () => {
  it('renders one canvas-post wrapper per post', () => {
    const posts = [vm({ postId: 'p1' }), vm({ postId: 'p2', postNumber: 2 })]
    render(
      <ReviewPostsCanvas
        posts={posts}
        selectedPostId={null}
        selectedThreadId={null}
        onPinClick={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('review-posts-canvas')).toBeTruthy()
    expect(screen.getByTestId('canvas-post-p1')).toBeTruthy()
    expect(screen.getByTestId('canvas-post-p2')).toBeTruthy()
  })

  it('sets data-selected="true" on the selected post and "false" on others', () => {
    const posts = [vm({ postId: 'p1' }), vm({ postId: 'p2', postNumber: 2 })]
    render(
      <ReviewPostsCanvas
        posts={posts}
        selectedPostId="p1"
        selectedThreadId={null}
        onPinClick={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('canvas-post-p1').dataset.selected).toBe('true')
    expect(screen.getByTestId('canvas-post-p2').dataset.selected).toBe('false')
  })

  it('calls onPinClick with postId and threadId when clicking an image pin', () => {
    const onPinClick = vi.fn()
    render(
      <ReviewPostsCanvas
        posts={[vm()]}
        selectedPostId={null}
        selectedThreadId={null}
        onPinClick={onPinClick}
        registerRef={vi.fn()}
      />,
    )
    // MarkupOverlay renders pins with data-testid="markup-overlay-pin" and data-thread-id
    const pin = screen.getByTestId('canvas-post-p1').querySelector('[data-thread-id="t1"]')
    expect(pin).toBeTruthy()
    fireEvent.click(pin!)
    expect(onPinClick).toHaveBeenCalledWith('p1', 't1')
  })

  it('calls onPinClick when clicking a caption chip', () => {
    const onPinClick = vi.fn()
    render(
      <ReviewPostsCanvas
        posts={[vm({ threads: [captionThread('ct1')] })]}
        selectedPostId={null}
        selectedThreadId={null}
        onPinClick={onPinClick}
        registerRef={vi.fn()}
      />,
    )
    const chip = screen.getByTestId('canvas-pin-ct1')
    fireEvent.click(chip)
    expect(onPinClick).toHaveBeenCalledWith('p1', 'ct1')
  })

  it('renders a "No image" placeholder when mediaUrls is empty', () => {
    render(
      <ReviewPostsCanvas
        posts={[vm({ mediaUrls: [], threads: [] })]}
        selectedPostId={null}
        selectedThreadId={null}
        onPinClick={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    expect(screen.getByTestId('canvas-post-no-media-p1')).toBeTruthy()
  })

  it('applies a selected highlight to the selected thread chip', () => {
    render(
      <ReviewPostsCanvas
        posts={[vm({ threads: [captionThread('ct1')] })]}
        selectedPostId="p1"
        selectedThreadId="ct1"
        onPinClick={vi.fn()}
        registerRef={vi.fn()}
      />,
    )
    const chip = screen.getByTestId('canvas-pin-ct1')
    expect(chip.dataset.selected).toBe('true')
  })

  it('calls registerRef with postId and the DOM element', () => {
    const registerRef = vi.fn()
    render(
      <ReviewPostsCanvas
        posts={[vm()]}
        selectedPostId={null}
        selectedThreadId={null}
        onPinClick={vi.fn()}
        registerRef={registerRef}
      />,
    )
    // registerRef should have been called with 'p1' and a DOM element
    expect(registerRef).toHaveBeenCalledWith('p1', expect.any(HTMLElement))
  })
})
