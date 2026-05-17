import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { FeedPostProps } from '@/types/preview'

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
              author: { kind: 'am', userId: 'u', name: 'AM' },
              body: 'fix this',
              createdAt: new Date(),
            },
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
              author: { kind: 'am', userId: 'u', name: 'AM' },
              body: 'fix this',
              createdAt: new Date(),
            },
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
})
