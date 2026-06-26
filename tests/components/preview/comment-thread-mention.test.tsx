import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CommentThread } from '@/components/preview/comment-thread'
import type { MentionTarget } from '@/lib/mentions'

const ROSTER: MentionTarget[] = [
  { id: 'u1', name: 'Dan Designer', handle: 'dan.designer' },
]

const c1 = { id: '1', author: { kind: 'client' as const, reviewerName: 'Dana' }, body: 'hi' }

describe('CommentThread @-mention autocomplete', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows roster suggestions when typing @ (roster provided)', () => {
    render(<CommentThread comments={[c1]} onSend={vi.fn()} mentionRoster={ROSTER} />)
    const input = screen.getByTestId('comment-composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@dan' } })
    expect(screen.getByRole('listbox', { name: /mention/i })).toBeInTheDocument()
    expect(screen.getByText('Dan Designer')).toBeInTheDocument()
  })

  it('renders NO autocomplete with no roster prop (client-review parity)', () => {
    render(<CommentThread comments={[c1]} onSend={vi.fn()} />)
    const input = screen.getByTestId('comment-composer-input') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '@dan' } })
    expect(screen.queryByRole('listbox', { name: /mention/i })).toBeNull()
  })
})
