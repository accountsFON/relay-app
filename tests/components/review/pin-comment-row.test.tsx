import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { PinCommentRow } from '@/components/review/pin-comment-row'
import type { HydratedThread } from '@/server/repositories/threads'

function thread(over: Partial<HydratedThread> = {}): HydratedThread {
  const firstComment = {
    id: 'c1',
    body: 'Make the logo bigger',
    author: { kind: 'client' as const, reviewerName: 'Jane' },
    imageUrl: 'https://blob.vercel-storage.com/comment-images/first.png',
    imageWidth: 200,
    imageHeight: 100,
    createdAt: new Date(),
  }
  const reply1 = {
    id: 'c2',
    body: 'On it',
    author: { kind: 'am' as const, userId: 'u1', name: 'Mollie', avatarUrl: null },
    imageUrl: 'https://blob.vercel-storage.com/comment-images/reply.png',
    imageWidth: 300,
    imageHeight: 150,
    createdAt: new Date(),
  }
  return {
    id: 't1',
    pin: { kind: 'image', x: 10, y: 20 },
    status: 'open',
    firstComment,
    comments: [firstComment, reply1],
    commentCount: 2,
    ...over,
  }
}

describe('PinCommentRow — collapsed', () => {
  it('shows the first comment body in the header', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    // Body text must be present
    expect(screen.getByText('Make the logo bigger')).toBeInTheDocument()
  })

  it('shows reply count badge when there are replies', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-row-reply-count-t1')).toHaveTextContent('1 reply')
  })

  it('does NOT show the first comment image when collapsed', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('pin-comment-image')).toBeNull()
  })

  it('does NOT render replies when collapsed', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.queryAllByTestId('pin-comment-reply')).toHaveLength(0)
  })

  it('does NOT render the composer when collapsed', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('pin-comment-input-t1')).toBeNull()
  })
})

describe('PinCommentRow — header body is fully present and wrapped', () => {
  it('body element has whitespace-pre-wrap class and full text', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    // The element that contains the body text must have whitespace-pre-wrap
    const bodyEl = screen.getByText('Make the logo bigger')
    expect(bodyEl.className).toContain('whitespace-pre-wrap')
    expect(bodyEl.textContent).toBe('Make the logo bigger')
  })
})

describe('PinCommentRow — header toggle', () => {
  it('calls onToggle when the header button is clicked', () => {
    const onToggle = vi.fn()
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={onToggle}
        onComment={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('pin-comment-row-t1'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('sets data-expanded attribute based on expanded prop', () => {
    const { rerender } = render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-row-t1')).toHaveAttribute('data-expanded', 'false')
    rerender(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-row-t1')).toHaveAttribute('data-expanded', 'true')
  })
})

describe('PinCommentRow — expanded', () => {
  it('shows the first comment image when expanded', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-image')).toBeInTheDocument()
  })

  it('renders replies when expanded', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('pin-comment-reply')).toHaveLength(1)
  })

  it('renders the composer textarea when expanded', () => {
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-input-t1')).toBeInTheDocument()
  })

  it('typing and clicking Send calls onComment', async () => {
    const onComment = vi.fn(() => Promise.resolve())
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={onComment}
      />,
    )
    fireEvent.change(screen.getByTestId('pin-comment-input-t1'), {
      target: { value: 'hi' },
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-comment-send-t1'))
    })
    await waitFor(() =>
      expect(onComment).toHaveBeenCalledWith('t1', 'hi', undefined),
    )
  })

  it('clears the textarea after a successful send', async () => {
    const onComment = vi.fn(() => Promise.resolve())
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={onComment}
      />,
    )
    const input = screen.getByTestId('pin-comment-input-t1')
    fireEvent.change(input, { target: { value: 'hi' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-comment-send-t1'))
    })
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
  })

  it('shows a role=alert error when onComment throws', async () => {
    const onComment = vi.fn(() => Promise.reject(new Error('network error')))
    render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={onComment}
      />,
    )
    fireEvent.change(screen.getByTestId('pin-comment-input-t1'), {
      target: { value: 'bad send' },
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-comment-send-t1'))
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

describe('PinCommentRow — reply count hidden when no replies', () => {
  it('does not render reply count badge when thread has a single comment', () => {
    const singleCommentThread = thread({
      comments: [
        {
          id: 'c1',
          body: 'Make the logo bigger',
          author: { kind: 'client' as const, reviewerName: 'Jane' },
          imageUrl: null,
          imageWidth: null,
          imageHeight: null,
          createdAt: new Date(),
        },
      ],
      commentCount: 1,
    })
    render(
      <PinCommentRow
        thread={singleCommentThread}
        pinLabel="1"
        expanded={false}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('pin-comment-row-reply-count-t1')).toBeNull()
  })
})

describe('PinCommentRow — resolve button', () => {
  it('shows resolve button only when onResolve provided and thread is open', () => {
    const { rerender } = render(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
      />,
    )
    // No onResolve — button absent
    expect(screen.queryByTestId('pin-comment-resolve-t1')).toBeNull()

    rerender(
      <PinCommentRow
        thread={thread()}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
        onResolve={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pin-comment-resolve-t1')).toBeInTheDocument()

    // Thread resolved — button hidden even with onResolve
    rerender(
      <PinCommentRow
        thread={thread({ status: 'resolved' })}
        pinLabel="1"
        expanded={true}
        onToggle={vi.fn()}
        onComment={vi.fn()}
        onResolve={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('pin-comment-resolve-t1')).toBeNull()
  })
})
