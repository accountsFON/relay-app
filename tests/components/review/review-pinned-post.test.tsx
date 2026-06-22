import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewPinnedPost } from '@/components/review/review-pinned-post'
import type { HydratedThread } from '@/server/repositories/threads'

function imageThread(id: string, status: 'open' | 'resolved' = 'open'): HydratedThread {
  return {
    id,
    status,
    pin: { kind: 'image', x: 30, y: 40 },
    firstComment: { author: { kind: 'client', reviewerName: 'Sarah' }, body: 'fix the logo', createdAt: new Date(), imageUrl: null, imageWidth: null, imageHeight: null },
    comments: [{ author: { kind: 'client', reviewerName: 'Sarah' }, body: 'fix the logo', createdAt: new Date() }],
    commentCount: 1,
  }
}

function imageThreadWithAttachment(id: string): HydratedThread {
  return {
    id,
    status: 'open',
    pin: { kind: 'image', x: 30, y: 40 },
    firstComment: {
      author: { kind: 'client', reviewerName: 'Sarah' },
      body: 'see ref',
      createdAt: new Date(),
      imageUrl: 'https://blob.example.com/ref.png',
      imageWidth: 1024,
      imageHeight: 768,
    },
    comments: [{ author: { kind: 'client', reviewerName: 'Sarah' }, body: 'see ref', createdAt: new Date() }],
    commentCount: 1,
  }
}
function captionThread(id: string): HydratedThread {
  return {
    id,
    status: 'open',
    pin: { kind: 'caption', from: 0, to: 5 },
    firstComment: { author: { kind: 'client', reviewerName: 'Sarah' }, body: 'too long', createdAt: new Date() },
    comments: [{ author: { kind: 'client', reviewerName: 'Sarah' }, body: 'too long', createdAt: new Date() }],
    commentCount: 1,
  }
}

describe('ReviewPinnedPost', () => {
  it('renders image pins on the overlay and a read-only comment list', () => {
    render(
      <ReviewPinnedPost
        postId="postA"
        mediaUrl="https://example.com/a.jpg"
        caption="Hello"
        threads={[imageThread('t1'), captionThread('t2')]}
      />,
    )
    expect(screen.getAllByTestId('markup-overlay-pin')).toHaveLength(1) // image pin only
    expect(screen.getByTestId('review-pinned-post-chip')).toBeTruthy() // caption chip
    expect(screen.getAllByTestId('review-pin-comment')).toHaveLength(2) // both in the list
    const list = screen.getByTestId('review-pinned-post-comment-list')
    expect(list).toHaveTextContent('fix the logo')
    // The list leads with the client's entered name, not the pin-kind label.
    expect(list).toHaveTextContent('Sarah')
    expect(list).not.toHaveTextContent('Image pin')
  })

  it('opens the popover on pin click and fires onResolve with the thread id', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(
      <ReviewPinnedPost
        postId="postA"
        mediaUrl="https://example.com/a.jpg"
        caption="Hello"
        threads={[imageThread('t1')]}
        onResolve={onResolve}
      />,
    )
    fireEvent.click(screen.getByTestId('markup-overlay-pin'))
    expect(screen.getByTestId('pin-popover')).toBeTruthy()
    fireEvent.click(screen.getByTestId('pin-popover-resolve'))
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('t1'))
  })

  it('renders a placeholder when the post has no image', () => {
    render(
      <ReviewPinnedPost postId="postA" mediaUrl={null} caption="Hello" threads={[captionThread('t2')]} />,
    )
    expect(screen.getByTestId('review-pinned-post-no-media')).toBeTruthy()
  })
})

describe('ReviewPinnedPost comment image rendering', () => {
  it('renders a comment-image img in the comment list when firstComment has imageUrl', () => {
    render(
      <ReviewPinnedPost
        postId="postA"
        mediaUrl="https://example.com/a.jpg"
        caption="Hello"
        threads={[imageThreadWithAttachment('t1')]}
      />,
    )

    const img = screen.getByTestId('comment-image')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://blob.example.com/ref.png')
  })

  it('does NOT render a comment-image img when firstComment has no imageUrl', () => {
    render(
      <ReviewPinnedPost
        postId="postA"
        mediaUrl="https://example.com/a.jpg"
        caption="Hello"
        threads={[imageThread('t1')]}
      />,
    )

    expect(screen.queryByTestId('comment-image')).toBeNull()
  })
})
