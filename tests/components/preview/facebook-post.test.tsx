import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FacebookPost } from '@/components/preview/facebook-post'
import { FB_DEFAULT_ASPECT_RATIO } from '@/lib/feed-aspect-ratio'
import type { FeedPostProps } from '@/types/preview'

function fireImageLoad(img: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true })
  fireEvent.load(img)
}

function mediaAspectRatio(): number {
  const img = screen.getByTestId('fb-media') as HTMLElement
  return Number.parseFloat(img.style.aspectRatio)
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

function makeProps(overrides: Partial<FeedPostProps> = {}): FeedPostProps {
  return {
    post: {
      id: 'post-1',
      caption: 'Hello world',
      hashtags: [],
      mediaUrl: 'https://example.com/img.png',
    },
    client: {
      name: 'Cedar Creek Dental',
      avatarUrl: null,
    },
    threads: [],
    mode: 'internal',
    ...overrides,
  }
}

describe('FacebookPost', () => {
  it('renders caption above image (FB layout)', () => {
    const { container } = render(
      <FacebookPost {...makeProps({
        post: {
          id: 'p',
          caption: 'Caption first on Facebook',
          hashtags: [],
          mediaUrl: 'https://example.com/img.png',
        },
      })} />,
    )

    const caption = screen.getByTestId('fb-caption')
    const media = screen.getByTestId('fb-media')

    expect(caption).toHaveTextContent('Caption first on Facebook')
    expect(media).toBeInTheDocument()

    // Verify DOM order: caption appears before image.
    const article = container.querySelector('[data-testid="facebook-post"]')!
    const captionPos = Array.from(article.querySelectorAll('*')).indexOf(caption)
    const mediaPos = Array.from(article.querySelectorAll('*')).indexOf(media)
    expect(captionPos).toBeLessThan(mediaPos)
  })

  it('renders avatar from client.avatarUrl, falls back to first letter when null', () => {
    const { rerender } = render(
      <FacebookPost {...makeProps({
        client: { name: 'Old Plank Christian Academy', avatarUrl: 'https://cdn.example.com/avatar.jpg' },
      })} />,
    )

    const avatarImg = screen.getByTestId('fb-avatar-image') as HTMLImageElement
    expect(avatarImg.src).toBe('https://cdn.example.com/avatar.jpg')
    expect(screen.queryByTestId('fb-avatar-fallback')).toBeNull()

    rerender(
      <FacebookPost {...makeProps({
        client: { name: 'Old Plank Christian Academy', avatarUrl: null },
      })} />,
    )

    const fallback = screen.getByTestId('fb-avatar-fallback')
    expect(fallback).toHaveTextContent('O')
    expect(screen.queryByTestId('fb-avatar-image')).toBeNull()
  })

  it('renders "See more" truncation past 280 chars (FB allows longer than IG)', () => {
    // 300 char caption: should truncate.
    const longCaption = 'a'.repeat(300)
    render(<FacebookPost {...makeProps({
      post: {
        id: 'p',
        caption: longCaption,
        hashtags: [],
        mediaUrl: null,
      },
    })} />)

    expect(
      screen.getByRole('button', { name: 'See more' }),
    ).toBeInTheDocument()

    // 200 char caption: should NOT truncate.
    const shortCaption = 'a'.repeat(200)
    render(<FacebookPost {...makeProps({
      post: {
        id: 'p2',
        caption: shortCaption,
        hashtags: [],
        mediaUrl: null,
      },
    })} />)

    expect(screen.queryAllByRole('button', { name: 'See more' })).toHaveLength(1)
  })

  it('calls onOpenThread when an image pin (rendered via MarkupOverlay) is clicked', async () => {
    const onOpenThread = vi.fn()
    const user = userEvent.setup()

    render(
      <FacebookPost {...makeProps({
        threads: [
          {
            id: 'thread-xyz',
            status: 'open',
            pin: { kind: 'image', x: 25, y: 75 },
            firstComment: {
              id: 'c-fb-test',
              author: { kind: 'am', userId: 'u', name: 'AM' },
              body: 'fix this',
              createdAt: new Date(),
            },
            comments: [
              {
                id: 'c-fb-test',
                author: { kind: 'am', userId: 'u', name: 'AM' },
                body: 'fix this',
                createdAt: new Date(),
              },
            ],
            commentCount: 1,
          },
        ],
        onOpenThread,
      })} />,
    )

    // Layer 2.3: image pins now render via MarkupOverlay rather than inline.
    const pin = screen.getByTestId('markup-overlay-pin')
    await user.click(pin)

    expect(onOpenThread).toHaveBeenCalledTimes(1)
    expect(onOpenThread).toHaveBeenCalledWith('thread-xyz')
  })

  it('composes the markup primitives (overlay + caption markup) into the post', () => {
    render(
      <FacebookPost {...makeProps({
        post: {
          id: 'p',
          caption: 'Welcome to brunch.',
          hashtags: [],
          mediaUrl: 'https://example.com/img.jpg',
        },
      })} />,
    )

    expect(screen.getByTestId('markup-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('caption-markup')).toBeInTheDocument()
  })

  it('shows inline composer with focused textarea when a new image pin is dropped', async () => {
    mockOverlayRect()
    const user = userEvent.setup()
    const onCreateThread = vi.fn().mockResolvedValue(undefined)

    render(<FacebookPost {...makeProps({ onCreateThread })} />)

    expect(screen.queryByTestId('pin-draft-composer')).not.toBeInTheDocument()

    await user.pointer({
      target: screen.getByTestId('markup-overlay'),
      coords: { clientX: 200, clientY: 200 },
      keys: '[MouseLeft]',
    })

    const composer = screen.getByTestId('pin-draft-composer')
    expect(composer).toBeInTheDocument()
    expect(screen.getByTestId('pin-draft-composer-input')).toBe(
      document.activeElement,
    )
    expect(onCreateThread).not.toHaveBeenCalled()
  })

  it('composer Cancel closes without calling onCreateThread', async () => {
    mockOverlayRect()
    const user = userEvent.setup()
    const onCreateThread = vi.fn().mockResolvedValue(undefined)

    render(<FacebookPost {...makeProps({ onCreateThread })} />)

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

    render(<FacebookPost {...makeProps({ onCreateThread })} />)

    await user.pointer({
      target: screen.getByTestId('markup-overlay'),
      coords: { clientX: 200, clientY: 200 },
      keys: '[MouseLeft]',
    })

    const textarea = screen.getByTestId('pin-draft-composer-input')
    await user.type(textarea, 'Tighten the crop')
    await user.click(screen.getByTestId('pin-draft-composer-submit'))

    expect(onCreateThread).toHaveBeenCalledTimes(1)
    const [pin, body] = onCreateThread.mock.calls[0]
    expect(pin.kind).toBe('image')
    expect(body).toBe('Tighten the crop')
    expect(screen.queryByTestId('pin-draft-composer')).not.toBeInTheDocument()
  })

  it('opens the PinPopover when an image pin is clicked', async () => {
    const user = userEvent.setup()

    render(
      <FacebookPost {...makeProps({
        threads: [
          {
            id: 'thread-xyz',
            status: 'open',
            pin: { kind: 'image', x: 25, y: 75 },
            firstComment: {
              id: 'c-fb-test',
              author: { kind: 'am', userId: 'u', name: 'AM' },
              body: 'fix this',
              createdAt: new Date(),
            },
            comments: [
              {
                id: 'c-fb-test',
                author: { kind: 'am', userId: 'u', name: 'AM' },
                body: 'fix this',
                createdAt: new Date(),
              },
            ],
            commentCount: 1,
          },
        ],
        onComment: async () => {},
        onResolveThread: async () => {},
      })} />,
    )

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
        <FacebookPost {...makeProps({
          threads: [imageThread],
          onOpenThread,
          suppressInlinePopover: true,
        })} />,
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
        <FacebookPost {...makeProps({
          post: { id: 'p', caption: 'Caption.', hashtags: [], mediaUrl: null },
          threads: [postThread],
          onOpenThread,
          suppressInlinePopover: true,
        })} />,
      )

      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('fb-pin-badge'))
      expect(onOpenThread).toHaveBeenCalledTimes(1)
      expect(onOpenThread).toHaveBeenCalledWith('thread-post')
      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
    })

    it('without suppressInlinePopover (default): image pin click still opens the popover', async () => {
      const user = userEvent.setup()

      render(
        <FacebookPost {...makeProps({
          threads: [imageThread],
          onComment: async () => {},
        })} />,
      )

      expect(screen.queryByTestId('pin-popover')).not.toBeInTheDocument()
      await user.click(screen.getByTestId('markup-overlay-pin'))
      expect(screen.getByTestId('pin-popover')).toBeInTheDocument()
    })
  })

  describe('image aspect ratio', () => {
    it('renders the image at the 1.91:1 FB default before it loads', () => {
      render(<FacebookPost {...makeProps()} />)
      expect(mediaAspectRatio()).toBeCloseTo(FB_DEFAULT_ASPECT_RATIO)
    })

    it('renders square images at their natural 1:1 ratio (no clamp)', () => {
      render(<FacebookPost {...makeProps()} />)
      const img = screen.getByTestId('fb-media') as HTMLImageElement
      fireImageLoad(img, 1080, 1080)
      expect(mediaAspectRatio()).toBe(1)
    })

    it('renders portrait 4:5 images at their natural ratio (FB has no clamp)', () => {
      render(<FacebookPost {...makeProps()} />)
      const img = screen.getByTestId('fb-media') as HTMLImageElement
      fireImageLoad(img, 1080, 1350)
      expect(mediaAspectRatio()).toBeCloseTo(4 / 5)
    })

    it('renders landscape 16:9 images at their natural ratio', () => {
      render(<FacebookPost {...makeProps()} />)
      const img = screen.getByTestId('fb-media') as HTMLImageElement
      fireImageLoad(img, 1920, 1080)
      expect(mediaAspectRatio()).toBeCloseTo(16 / 9)
    })

    it('falls back to the 1.91:1 default for the placeholder when mediaUrl is null', () => {
      render(
        <FacebookPost
          {...makeProps({
            post: { id: 'p', caption: 'no media', hashtags: [], mediaUrl: null },
          })}
        />,
      )
      const placeholder = screen.getByTestId('fb-media-placeholder') as HTMLElement
      expect(Number.parseFloat(placeholder.style.aspectRatio)).toBeCloseTo(FB_DEFAULT_ASPECT_RATIO)
    })
  })

  describe('FacebookPost -- inline Edit copy', () => {
    const POST = { id: 'post-1', caption: 'Original caption', hashtags: [], mediaUrl: null }
    const CLIENT = { name: 'Test Client', avatarUrl: null }

    it('renders an Edit copy link only when onEditCaption is provided, and fires it on click', () => {
      const onEditCaption = vi.fn()
      const { rerender } = render(
        <FacebookPost
          post={POST}
          client={CLIENT}
          threads={[]}
          mode="review"
          onEditCaption={onEditCaption}
        />,
      )
      const link = screen.getByTestId('facebook-post-edit-copy')
      expect(link).toBeInTheDocument()
      expect(link).toHaveAccessibleName(/edit copy/i)
      fireEvent.click(link)
      expect(onEditCaption).toHaveBeenCalledTimes(1)

      rerender(
        <FacebookPost post={POST} client={CLIENT} threads={[]} mode="review" />,
      )
      expect(
        screen.queryByTestId('facebook-post-edit-copy'),
      ).not.toBeInTheDocument()
    })

    it('hides the Edit copy link while editing', () => {
      render(
        <FacebookPost
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
        screen.queryByTestId('facebook-post-edit-copy'),
      ).not.toBeInTheDocument()
    })
  })

  describe('inline caption edit', () => {
    it('renders the inline editor when editing is true', () => {
      render(
        <FacebookPost
          {...makeProps({
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
    })

    it('Save is disabled while draft equals the original caption', () => {
      render(
        <FacebookPost
          {...makeProps({
            post: { id: 'p', caption: 'Same.', hashtags: [], mediaUrl: 'https://example.com/x.png' },
            editing: true,
            captionDraft: 'Same.',
            onCaptionDraftChange: () => {},
            onCaptionEditSave: () => {},
            onCaptionEditCancel: () => {},
          })}
        />,
      )
      expect(screen.getByTestId('caption-edit-inline-save')).toBeDisabled()
    })

    it('Save + Cancel fire their respective handlers', async () => {
      const onCaptionEditSave = vi.fn()
      const onCaptionEditCancel = vi.fn()
      const user = userEvent.setup()
      render(
        <FacebookPost
          {...makeProps({
            post: { id: 'p', caption: 'Original.', hashtags: [], mediaUrl: 'https://example.com/x.png' },
            editing: true,
            captionDraft: 'Edited.',
            onCaptionDraftChange: () => {},
            onCaptionEditSave,
            onCaptionEditCancel,
          })}
        />,
      )
      await user.click(screen.getByTestId('caption-edit-inline-save'))
      expect(onCaptionEditSave).toHaveBeenCalledTimes(1)

      await user.click(screen.getByTestId('caption-edit-inline-cancel'))
      expect(onCaptionEditCancel).toHaveBeenCalledTimes(1)
    })

    it('renders captionOverride in place of post.caption when not editing', () => {
      render(
        <FacebookPost
          {...makeProps({
            post: { id: 'p', caption: 'Original caption.', hashtags: [], mediaUrl: 'https://example.com/x.png' },
            captionOverride: 'Reviewer suggested caption.',
          })}
        />,
      )
      const caption = screen.getByTestId('fb-caption')
      expect(caption.textContent).toContain('Reviewer suggested caption.')
      expect(caption.textContent).not.toContain('Original caption.')
      expect(screen.getByTestId('facebook-post-edit-indicator')).toBeInTheDocument()
    })

    it('view original / back to your edit toggle swaps the caption rendered', async () => {
      const user = userEvent.setup()
      render(
        <FacebookPost
          {...makeProps({
            post: { id: 'p', caption: 'Original caption.', hashtags: [], mediaUrl: 'https://example.com/x.png' },
            captionOverride: 'Reviewer suggested caption.',
          })}
        />,
      )

      const toggle = screen.getByTestId('facebook-post-toggle-original')
      expect(toggle.textContent).toBe('view original')

      await user.click(toggle)
      expect(screen.getByTestId('fb-caption').textContent).toContain('Original caption.')
      expect(toggle.textContent).toBe('back to your edit')

      await user.click(toggle)
      expect(screen.getByTestId('fb-caption').textContent).toContain('Reviewer suggested caption.')
    })
  })
})
