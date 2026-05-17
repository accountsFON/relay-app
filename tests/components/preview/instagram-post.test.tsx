import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstagramFeedPost } from '@/components/preview/instagram-post'
import type { FeedPostProps } from '@/types/preview'

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
                author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                body: 'Tighten the crop.',
                createdAt: new Date('2026-05-16T12:00:00Z'),
              },
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
                author: { kind: 'am', userId: 'u1', name: 'Mollie' },
                body: 'Tighten the crop.',
                createdAt: new Date('2026-05-16T12:00:00Z'),
              },
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
})
