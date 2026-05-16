import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FacebookPost } from '@/components/preview/facebook-post'
import type { FeedPostProps } from '@/types/preview'

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

  it('calls onOpenThread when a pin badge is clicked', async () => {
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

    const pin = screen.getByTestId('fb-pin-badge')
    await user.click(pin)

    expect(onOpenThread).toHaveBeenCalledTimes(1)
    expect(onOpenThread).toHaveBeenCalledWith('thread-xyz')
  })
})
