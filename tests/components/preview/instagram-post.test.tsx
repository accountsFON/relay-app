import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import {
  IG_MIN_ASPECT_RATIO,
  IG_MAX_ASPECT_RATIO,
} from '@/lib/feed-aspect-ratio'
import type { FeedPostProps } from '@/types/preview'

vi.mock('@/components/preview/post-image-replace', () => ({
  usePostImageReplace: () => ({
    dragProps: {},
    isDragging: false,
    overlay: <div data-testid="post-image-replace" />,
  }),
}))

function fireImageLoad(img: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true })
  fireEvent.load(img)
}

function mediaContainerAspectRatio(): number {
  const container = screen.getByTestId('instagram-post-media') as HTMLElement
  return Number.parseFloat(container.style.aspectRatio)
}

function mockOverlayRect() {
  // Force a known 400x400 layout so MarkupOverlay accepts clicks under JSDOM.
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON() {
      return {}
    },
  } as DOMRect)
}

function baseProps(overrides: Partial<FeedPostProps> = {}): FeedPostProps {
  return {
    post: {
      id: 'post-1',
      caption: 'Short caption.',
      hashtags: [],
      mediaUrl: null,
    },
    client: {
      name: 'Old Plank Christian',
      avatarUrl: null,
    },
    threads: [],
    mode: 'internal',
    ...overrides,
  }
}

describe('InstagramFeedPost', () => {
  it('renders caption with ...more truncation past 120 chars', () => {
    const longCaption = 'a'.repeat(200)
    render(<InstagramFeedPost {...baseProps({ post: { id: 'p', caption: longCaption, hashtags: [], mediaUrl: null } })} />)

    // CaptionMarkup wraps the visible (possibly truncated) caption text.
    const captionText = screen.getByTestId('caption-markup-text')
    // Truncated to exactly 120 chars before the "more" affordance.
    expect(captionText.textContent).toBe('a'.repeat(120))
    // The "more" button is rendered.
    expect(screen.getByTestId('instagram-post-more')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'more' })).toBeInTheDocument()
  })

  it('renders avatar from client.avatarUrl', () => {
    const avatarUrl = 'https://example.com/avatar.png'
    render(
      <InstagramFeedPost
        {...baseProps({
          client: { name: 'Old Plank Christian', avatarUrl },
        })}
      />,
    )

    const avatar = screen.getByTestId('instagram-post-avatar') as HTMLImageElement
    expect(avatar.tagName).toBe('IMG')
    expect(avatar.getAttribute('src')).toBe(avatarUrl)
    expect(avatar.getAttribute('alt')).toContain('Old Plank Christian')
  })

  it('renders hashtags as separate text after caption', () => {
    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Welcome to brunch.',
            hashtags: ['community', 'brunch', 'oldplank'],
            mediaUrl: null,
          },
        })}
      />,
    )

    const captionEl = screen.getByTestId('instagram-post-caption')
    const hashtagsEl = screen.getByTestId('instagram-post-hashtags')

    // Hashtags live in their own paragraph node, not concatenated into the caption.
    expect(hashtagsEl).toBeInTheDocument()
    expect(captionEl).not.toBe(hashtagsEl)
    expect(captionEl.contains(hashtagsEl)).toBe(false)
    expect(hashtagsEl.textContent).toBe('#community #brunch #oldplank')
  })

  it('calls onOpenThread when an image pin (rendered via MarkupOverlay) is clicked', async () => {
    const onOpenThread = vi.fn()
    const user = userEvent.setup()

    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Image with a pin.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
          threads: [
            {
              id: 'thread-xyz',
              status: 'open',
              pin: { kind: 'image', x: 25, y: 75 },
              firstComment: {
                id: 'c-ig-test',
                author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                body: 'Tighten the crop.',
                createdAt: new Date('2026-05-16T12:00:00Z'),
              },
              comments: [
                {
                  id: 'c-ig-test',
                  author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                  body: 'Tighten the crop.',
                  createdAt: new Date('2026-05-16T12:00:00Z'),
                },
              ],
              commentCount: 1,
            },
          ],
          onOpenThread,
        })}
      />,
    )

    // Layer 2.3: image pins now render via MarkupOverlay rather than inline.
    const pin = screen.getByTestId('markup-overlay-pin')
    expect(pin.getAttribute('data-thread-id')).toBe('thread-xyz')

    await user.click(pin)

    expect(onOpenThread).toHaveBeenCalledTimes(1)
    expect(onOpenThread).toHaveBeenCalledWith('thread-xyz')
  })

  it('composes the markup primitives (overlay + caption markup) into the post', () => {
    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Welcome to brunch.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
        })}
      />,
    )

    // MarkupOverlay sits over the image area.
    expect(screen.getByTestId('markup-overlay')).toBeInTheDocument()
    // CaptionMarkup wraps the caption.
    expect(screen.getByTestId('caption-markup')).toBeInTheDocument()
  })

  it('shows inline composer with focused textarea when a new image pin is dropped', async () => {
    mockOverlayRect()
    const user = userEvent.setup()
    const onCreateThread = vi.fn().mockResolvedValue(undefined)

    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Compose me.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
          onCreateThread,
        })}
      />,
    )

    // No composer until the user clicks the image.
    expect(screen.queryByTestId('pin-draft-composer')).not.toBeInTheDocument()

    await user.pointer({
      target: screen.getByTestId('markup-overlay'),
      coords: { clientX: 200, clientY: 200 },
      keys: '[MouseLeft]',
    })

    const composer = screen.getByTestId('pin-draft-composer')
    expect(composer).toBeInTheDocument()

    const textarea = screen.getByTestId('pin-draft-composer-input')
    expect(textarea).toBe(document.activeElement)
    // Should not have called onCreateThread yet , we wait on the user submit.
    expect(onCreateThread).not.toHaveBeenCalled()
  })

  it('composer Cancel closes without calling onCreateThread', async () => {
    mockOverlayRect()
    const user = userEvent.setup()
    const onCreateThread = vi.fn().mockResolvedValue(undefined)

    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Cancel me.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
          onCreateThread,
        })}
      />,
    )

    await user.pointer({
      target: screen.getByTestId('markup-overlay'),
      coords: { clientX: 200, clientY: 200 },
      keys: '[MouseLeft]',
    })
    expect(screen.getByTestId('pin-draft-composer')).toBeInTheDocument()

    await user.click(screen.getByTestId('pin-draft-composer-cancel'))

    expect(screen.queryByTestId('pin-draft-composer')).not.toBeInTheDocument()
    expect(onCreateThread).not.toHaveBeenCalled()
  })

  it('composer Comment submit calls onCreateThread with pin + body', async () => {
    mockOverlayRect()
    const user = userEvent.setup()
    const onCreateThread = vi.fn().mockResolvedValue(undefined)

    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Submit me.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
          onCreateThread,
        })}
      />,
    )

    await user.pointer({
      target: screen.getByTestId('markup-overlay'),
      coords: { clientX: 200, clientY: 200 },
      keys: '[MouseLeft]',
    })

    const textarea = screen.getByTestId('pin-draft-composer-input')
    await user.type(textarea, 'Looks great')
    await user.click(screen.getByTestId('pin-draft-composer-submit'))

    expect(onCreateThread).toHaveBeenCalledTimes(1)
    const [pin, body] = onCreateThread.mock.calls[0]
    expect(pin.kind).toBe('image')
    expect(typeof pin.x).toBe('number')
    expect(typeof pin.y).toBe('number')
    expect(body).toBe('Looks great')

    // Composer closes after successful submit.
    expect(screen.queryByTestId('pin-draft-composer')).not.toBeInTheDocument()
  })

  it('opens the PinPopover when an image pin is clicked', async () => {
    const user = userEvent.setup()

    render(
      <InstagramFeedPost
        {...baseProps({
          post: {
            id: 'p',
            caption: 'Image with a pin.',
            hashtags: [],
            mediaUrl: 'https://example.com/img.jpg',
          },
          threads: [
            {
              id: 'thread-xyz',
              status: 'open',
              pin: { kind: 'image', x: 25, y: 75 },
              firstComment: {
                id: 'c-ig-test',
                author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                body: 'Tighten the crop.',
                createdAt: new Date('2026-05-16T12:00:00Z'),
              },
              comments: [
                {
                  id: 'c-ig-test',
                  author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                  body: 'Tighten the crop.',
                  createdAt: new Date('2026-05-16T12:00:00Z'),
                },
              ],
              commentCount: 1,
            },
          ],
          // Wire callbacks so the popover renders affordances.
          onComment: async () => {},
          onResolveThread: async () => {},
        })}
      />,
    )

    // No popover until the pin is clicked.
    expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('markup-overlay-pin'))

    const popover = screen.getByTestId('pin-popover')
    expect(popover.getAttribute('data-thread-id')).toBe('thread-xyz')
  })

  describe('suppressInlinePopover', () => {
    const imageThread = {
      id: 'thread-img',
      status: 'open' as const,
      pin: { kind: 'image' as const, x: 50, y: 50 },
      firstComment: {
        id: 'c1',
        author: { kind: 'am' as const, userId: 'u1', name: 'AM' },
        body: 'Image feedback',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
      comments: [
        {
          id: 'c1',
          author: { kind: 'am' as const, userId: 'u1', name: 'AM' },
          body: 'Image feedback',
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    const postThread = {
      id: 'thread-post',
      status: 'open' as const,
      pin: { kind: 'post' as const },
      firstComment: {
        id: 'c2',
        author: { kind: 'am' as const, userId: 'u1', name: 'AM' },
        body: 'Post level feedback',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
      comments: [
        {
          id: 'c2',
          author: { kind: 'am' as const, userId: 'u1', name: 'AM' },
          body: 'Post level feedback',
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
      ],
      commentCount: 1,
    }

    it('with suppressInlinePopover: image pin click calls onOpenThread but does NOT open the internal popover', async () => {
      const onOpenThread = vi.fn()
      const user = userEvent.setup()

      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Caption.', hashtags: [], mediaUrl: 'https://example.com/img.jpg' },
            threads: [imageThread],
            onOpenThread,
            suppressInlinePopover: true,
          })}
        />,
      )

      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('markup-overlay-pin'))
      expect(onOpenThread).toHaveBeenCalledTimes(1)
      expect(onOpenThread).toHaveBeenCalledWith('thread-img')
      // Popover must NOT appear.
      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
    })

    it('with suppressInlinePopover: post-level pin click calls onOpenThread but does NOT open the internal popover', async () => {
      const onOpenThread = vi.fn()
      const user = userEvent.setup()

      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Caption.', hashtags: [], mediaUrl: null },
            threads: [postThread],
            onOpenThread,
            suppressInlinePopover: true,
          })}
        />,
      )

      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('instagram-post-pin'))
      expect(onOpenThread).toHaveBeenCalledTimes(1)
      expect(onOpenThread).toHaveBeenCalledWith('thread-post')
      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
    })

    it('without suppressInlinePopover (default): image pin click still opens the popover', async () => {
      const user = userEvent.setup()

      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Caption.', hashtags: [], mediaUrl: 'https://example.com/img.jpg' },
            threads: [imageThread],
            onComment: async () => {},
          })}
        />,
      )

      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('markup-overlay-pin'))
      expect(screen.getByTestId('pin-popover')).toBeInTheDocument()
    })
  })

  describe('image replace overlay', () => {
    it('renders the image-replace overlay inside the media container when canReplaceImage is set', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Replaceable.',
              hashtags: [],
              mediaUrl: 'https://example.com/img.jpg',
            },
            canReplaceImage: true,
          })}
        />,
      )

      const overlay = screen.getByTestId('post-image-replace')
      expect(overlay).toBeInTheDocument()
      // Overlay is mounted inside the media container so it anchors to the image.
      expect(screen.getByTestId('instagram-post-media').contains(overlay)).toBe(true)
    })

    it('does NOT render the image-replace overlay when canReplaceImage is absent', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Not replaceable.',
              hashtags: [],
              mediaUrl: 'https://example.com/img.jpg',
            },
          })}
        />,
      )

      expect(screen.queryByTestId('post-image-replace')).not.toBeInTheDocument()
    })
  })

  describe('image aspect ratio', () => {
    it('renders the media container at 1:1 (square) before the image loads', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'No load yet',
              hashtags: [],
              mediaUrl: 'https://example.com/img.jpg',
            },
          })}
        />,
      )
      expect(mediaContainerAspectRatio()).toBe(1)
    })

    it('keeps the natural ratio for in-range portrait (4:5) images', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Portrait',
              hashtags: [],
              mediaUrl: 'https://example.com/portrait.jpg',
            },
          })}
        />,
      )
      const img = screen.getByTestId('instagram-post-media').querySelector('img') as HTMLImageElement
      fireImageLoad(img, 1080, 1350) // 4:5
      expect(mediaContainerAspectRatio()).toBeCloseTo(4 / 5)
    })

    it('keeps the natural ratio for in-range landscape (16:9) images', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Landscape',
              hashtags: [],
              mediaUrl: 'https://example.com/wide.jpg',
            },
          })}
        />,
      )
      const img = screen.getByTestId('instagram-post-media').querySelector('img') as HTMLImageElement
      fireImageLoad(img, 1920, 1080) // 16:9 ≈ 1.78, within IG range
      expect(mediaContainerAspectRatio()).toBeCloseTo(16 / 9)
    })

    it('clamps ultra-tall portrait (9:16 phone vertical) to the IG 4:5 floor', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Tall phone',
              hashtags: [],
              mediaUrl: 'https://example.com/tall.jpg',
            },
          })}
        />,
      )
      const img = screen.getByTestId('instagram-post-media').querySelector('img') as HTMLImageElement
      fireImageLoad(img, 1080, 1920) // 9:16
      expect(mediaContainerAspectRatio()).toBeCloseTo(IG_MIN_ASPECT_RATIO)
    })

    it('clamps ultra-wide panorama (3:1) to the IG 1.91:1 ceiling', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: {
              id: 'p',
              caption: 'Panorama',
              hashtags: [],
              mediaUrl: 'https://example.com/pano.jpg',
            },
          })}
        />,
      )
      const img = screen.getByTestId('instagram-post-media').querySelector('img') as HTMLImageElement
      fireImageLoad(img, 3000, 1000) // 3:1
      expect(mediaContainerAspectRatio()).toBeCloseTo(IG_MAX_ASPECT_RATIO)
    })

    it('falls back to square when mediaUrl is null', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'no media', hashtags: [], mediaUrl: null },
          })}
        />,
      )
      expect(mediaContainerAspectRatio()).toBe(1)
    })
  })

  describe('inline caption edit', () => {
    it('renders the inline editor with textarea + save/cancel when editing is true', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Original caption.', hashtags: ['tag1'], mediaUrl: null },
            editing: true,
            captionDraft: 'My new draft',
            onCaptionDraftChange: () => {},
            onCaptionEditSave: () => {},
            onCaptionEditCancel: () => {},
          })}
        />,
      )

      const textarea = screen.getByTestId('caption-edit-inline-textarea') as HTMLTextAreaElement
      expect(textarea.value).toBe('My new draft')
      expect(screen.getByTestId('caption-edit-inline-save')).toBeInTheDocument()
      expect(screen.getByTestId('caption-edit-inline-cancel')).toBeInTheDocument()

      // Read-only caption is suppressed while editing; hashtags remain.
      expect(screen.queryByTestId('instagram-post-caption')).not.toBeInTheDocument()
      expect(screen.getByTestId('instagram-post-hashtags')).toBeInTheDocument()
    })

    it('Save is disabled while the draft equals the original caption', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Same text.', hashtags: [], mediaUrl: null },
            editing: true,
            captionDraft: 'Same text.',
            onCaptionDraftChange: () => {},
            onCaptionEditSave: () => {},
            onCaptionEditCancel: () => {},
          })}
        />,
      )

      expect(screen.getByTestId('caption-edit-inline-save')).toBeDisabled()
    })

    it('Save fires onCaptionEditSave when draft differs', async () => {
      const onCaptionEditSave = vi.fn()
      const user = userEvent.setup()

      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Original.', hashtags: [], mediaUrl: null },
            editing: true,
            captionDraft: 'A different caption.',
            onCaptionDraftChange: () => {},
            onCaptionEditSave,
            onCaptionEditCancel: () => {},
          })}
        />,
      )

      await user.click(screen.getByTestId('caption-edit-inline-save'))
      expect(onCaptionEditSave).toHaveBeenCalledTimes(1)
    })

    it('Cancel fires onCaptionEditCancel', async () => {
      const onCaptionEditCancel = vi.fn()
      const user = userEvent.setup()

      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Original.', hashtags: [], mediaUrl: null },
            editing: true,
            captionDraft: 'A change.',
            onCaptionDraftChange: () => {},
            onCaptionEditSave: () => {},
            onCaptionEditCancel,
          })}
        />,
      )

      await user.click(screen.getByTestId('caption-edit-inline-cancel'))
      expect(onCaptionEditCancel).toHaveBeenCalledTimes(1)
    })

    it('renders captionOverride instead of post.caption when not editing', () => {
      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Original caption.', hashtags: [], mediaUrl: null },
            captionOverride: 'Reviewer suggested caption.',
          })}
        />,
      )

      const caption = screen.getByTestId('instagram-post-caption')
      expect(caption.textContent).toContain('Reviewer suggested caption.')
      expect(caption.textContent).not.toContain('Original caption.')
      expect(screen.getByTestId('instagram-post-edit-indicator')).toBeInTheDocument()
    })

    it('view original / back to your edit toggle swaps which caption is rendered', async () => {
      const user = userEvent.setup()
      render(
        <InstagramFeedPost
          {...baseProps({
            post: { id: 'p', caption: 'Original caption.', hashtags: [], mediaUrl: null },
            captionOverride: 'Reviewer suggested caption.',
          })}
        />,
      )

      const toggle = screen.getByTestId('instagram-post-toggle-original')
      expect(toggle.textContent).toBe('view original')

      await user.click(toggle)
      expect(screen.getByTestId('instagram-post-caption').textContent).toContain('Original caption.')
      expect(toggle.textContent).toBe('back to your edit')

      await user.click(toggle)
      expect(screen.getByTestId('instagram-post-caption').textContent).toContain(
        'Reviewer suggested caption.',
      )
    })
  })
})

describe('InstagramFeedPost -- inline Edit copy', () => {
  const POST = { id: 'post-1', caption: 'Original caption', hashtags: [], mediaUrl: null }
  const CLIENT = { name: 'Test Client', avatarUrl: null }

  it('renders an Edit copy link only when onEditCaption is provided, and fires it on click', () => {
    const onEditCaption = vi.fn()
    const { rerender } = render(
      <InstagramFeedPost
        post={POST}
        client={CLIENT}
        threads={[]}
        mode="review"
        onEditCaption={onEditCaption}
      />,
    )
    const link = screen.getByTestId('instagram-post-edit-copy')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAccessibleName(/edit copy/i)
    fireEvent.click(link)
    expect(onEditCaption).toHaveBeenCalledTimes(1)

    rerender(
      <InstagramFeedPost post={POST} client={CLIENT} threads={[]} mode="review" />,
    )
    expect(
      screen.queryByTestId('instagram-post-edit-copy'),
    ).not.toBeInTheDocument()
  })

  it('hides the Edit copy link while editing', () => {
    render(
      <InstagramFeedPost
        post={POST}
        client={CLIENT}
        threads={[]}
        mode="review"
        onEditCaption={vi.fn()}
        editing
        captionDraft="draft"
      />,
    )
    expect(
      screen.queryByTestId('instagram-post-edit-copy'),
    ).not.toBeInTheDocument()
  })
})
