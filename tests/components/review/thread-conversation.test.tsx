import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { ThreadConversation } from '@/components/review/thread-conversation'
import type { HydratedThread } from '@/server/repositories/threads'

function thread(over: Partial<HydratedThread> = {}): HydratedThread {
  const a = { id: 'c1', body: 'Make the logo bigger', author: { kind: 'client' as const, reviewerName: 'Jane' }, imageUrl: 'https://blob.vercel-storage.com/comment-images/x.png', imageWidth: 200, imageHeight: 100, createdAt: new Date() }
  const b = { id: 'c2', body: 'On it', author: { kind: 'am' as const, userId: 'u1', name: 'Mollie', avatarUrl: null }, imageUrl: null, imageWidth: null, imageHeight: null, createdAt: new Date() }
  return { id: 't1', pin: { kind: 'image', x: 10, y: 20 }, status: 'open', firstComment: a, comments: [a, b], commentCount: 2, ...over }
}

describe('ThreadConversation', () => {
  it('renders the full dialogue in order with both authors', () => {
    render(<ThreadConversation thread={thread()} onComment={vi.fn()} />)
    const items = screen.getAllByTestId('thread-conversation-comment')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Jane')
    expect(items[1]).toHaveTextContent('Mollie')
  })
  it('stacks a comment image below its text (flex-col)', () => {
    render(<ThreadConversation thread={thread()} onComment={vi.fn()} />)
    const withImg = screen.getAllByTestId('thread-conversation-comment')[0]
    expect(withImg.className).toContain('flex')
    expect(withImg.className).toContain('flex-col')
  })
  it('posts a reply via onComment', async () => {
    const onComment = vi.fn(() => Promise.resolve())
    render(<ThreadConversation thread={thread()} onComment={onComment} />)
    fireEvent.change(screen.getByTestId('thread-conversation-input'), { target: { value: 'looks good' } })
    await act(async () => { fireEvent.click(screen.getByTestId('thread-conversation-send')) })
    await waitFor(() => expect(onComment).toHaveBeenCalledWith('t1', 'looks good', undefined))
  })
  it('shows Resolve only when onResolve is provided and the thread is open', () => {
    const { rerender } = render(<ThreadConversation thread={thread()} onComment={vi.fn()} />)
    expect(screen.queryByTestId('thread-conversation-resolve')).toBeNull()
    rerender(<ThreadConversation thread={thread()} onComment={vi.fn()} onResolve={vi.fn()} />)
    expect(screen.getByTestId('thread-conversation-resolve')).toBeInTheDocument()
    rerender(<ThreadConversation thread={thread({ status: 'resolved' })} onComment={vi.fn()} onResolve={vi.fn()} />)
    expect(screen.queryByTestId('thread-conversation-resolve')).toBeNull()
  })
})
