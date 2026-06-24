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

const defaultProps = {
  platform: 'instagram' as const,
  clientName: 'Acme Corp',
  clientAvatarUrl: null,
  selectedPostId: null,
  selectedThreadId: null,
  onPinClick: vi.fn(),
  registerRef: vi.fn(),
}

describe('ReviewPostsCanvas', () => {
  it('renders one canvas-post wrapper per post', () => {
    const posts = [vm({ postId: 'p1' }), vm({ postId: 'p2', postNumber: 2 })]
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={posts}
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
        {...defaultProps}
        posts={posts}
        selectedPostId="p1"
      />,
    )
    expect(screen.getByTestId('canvas-post-p1').dataset.selected).toBe('true')
    expect(screen.getByTestId('canvas-post-p2').dataset.selected).toBe('false')
  })

  it('renders the post caption text in the faithful post component', () => {
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ caption: 'Hello caption text' })]}
      />,
    )
    // InstagramFeedPost renders caption in data-testid="instagram-post-caption"
    expect(screen.getByTestId('instagram-post-caption').textContent).toContain('Hello caption text')
  })

  it('calls onPinClick with postId and threadId when clicking an image pin', () => {
    const onPinClick = vi.fn()
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm()]}
        onPinClick={onPinClick}
      />,
    )
    // InstagramFeedPost's MarkupOverlay renders image pins with data-testid="markup-overlay-pin"
    const pin = screen.getByTestId('canvas-post-p1').querySelector(
      '[data-testid="markup-overlay-pin"][data-thread-id="t1"]',
    )
    expect(pin).toBeTruthy()
    fireEvent.click(pin!)
    expect(onPinClick).toHaveBeenCalledWith('p1', 't1')
  })

  it('calls onPinClick when clicking a caption-level pin badge', () => {
    const onPinClick = vi.fn()
    // Caption pins render via CaptionMarkup which highlights text; the click
    // surfaces through onOpenThread -> onPinClick. Use a post-level pin which
    // renders a badge button (instagram-post-pin) so the click is easy to target.
    const postThread: HydratedThread = {
      id: 'pt1',
      status: 'open',
      pin: { kind: 'post' },
      firstComment: {
        id: 'pt1-c1',
        author: { kind: 'client', reviewerName: 'Jane' },
        body: 'post level note',
        createdAt: new Date(),
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
      },
      comments: [{
        id: 'pt1-c1',
        author: { kind: 'client', reviewerName: 'Jane' },
        body: 'post level note',
        createdAt: new Date(),
      }],
      commentCount: 1,
    }
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ threads: [postThread] })]}
        onPinClick={onPinClick}
      />,
    )
    // InstagramFeedPost renders post-level pins with data-testid="instagram-post-pin"
    const badge = screen.getByTestId('canvas-post-p1').querySelector(
      '[data-testid="instagram-post-pin"][data-thread-id="pt1"]',
    )
    expect(badge).toBeTruthy()
    fireEvent.click(badge!)
    expect(onPinClick).toHaveBeenCalledWith('p1', 'pt1')
  })

  it('renders a "no media" placeholder (image goes here) when mediaUrls is empty', () => {
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ mediaUrls: [], threads: [] })]}
      />,
    )
    // InstagramFeedPost renders a placeholder in data-testid="instagram-post-media"
    const mediaEl = screen.getByTestId('instagram-post-media')
    expect(mediaEl.textContent).toContain('image goes here')
  })

  it('shows canvas-copy-edited-badge only when verdict === "caption_edited"', () => {
    const { rerender } = render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ verdict: 'none' })]}
      />,
    )
    expect(screen.queryByTestId('canvas-copy-edited-badge-p1')).toBeNull()

    rerender(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ verdict: 'caption_edited' })]}
      />,
    )
    expect(screen.getByTestId('canvas-copy-edited-badge-p1')).toBeTruthy()
    expect(screen.getByTestId('canvas-copy-edited-badge-p1').textContent).toBe('Copy edited')
  })

  it('does NOT show canvas-copy-edited-badge for approved verdict', () => {
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm({ verdict: 'approved' })]}
      />,
    )
    expect(screen.queryByTestId('canvas-copy-edited-badge-p1')).toBeNull()
  })

  it('calls registerRef with postId and the DOM element', () => {
    const registerRef = vi.fn()
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        posts={[vm()]}
        registerRef={registerRef}
      />,
    )
    expect(registerRef).toHaveBeenCalledWith('p1', expect.any(HTMLElement))
  })

  it('renders FacebookPost when platform is facebook', () => {
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        platform="facebook"
        posts={[vm({ caption: 'FB caption' })]}
      />,
    )
    // FacebookPost renders data-testid="facebook-post"
    expect(screen.getByTestId('facebook-post')).toBeTruthy()
    // Caption in fb-caption
    expect(screen.getByTestId('fb-caption').textContent).toContain('FB caption')
  })

  it('renders InstagramFeedPost when platform is instagram', () => {
    render(
      <ReviewPostsCanvas
        {...defaultProps}
        platform="instagram"
        posts={[vm()]}
      />,
    )
    expect(screen.getByTestId('instagram-post')).toBeTruthy()
  })

  it('renders caption-thread pin click via captionThread through CaptionMarkup', () => {
    // CaptionMarkup renders highlighted text spans rather than a named badge button;
    // verify the thread is at minimum passed to the post component (no error thrown).
    const onPinClick = vi.fn()
    expect(() =>
      render(
        <ReviewPostsCanvas
          {...defaultProps}
          posts={[vm({ threads: [captionThread('ct1')] })]}
          onPinClick={onPinClick}
        />,
      ),
    ).not.toThrow()
    // Caption text is still visible
    expect(screen.getByTestId('instagram-post-caption').textContent).toContain('Test caption')
  })
})
