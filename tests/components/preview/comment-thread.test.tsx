import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommentThread } from '@/components/preview/comment-thread'

const c1 = { id: '1', author: { kind: 'client' as const, reviewerName: 'Dana' }, body: 'hi' }
const c2 = { id: '2', author: { kind: 'am' as const, name: 'Mgr' }, body: 'hello' }

describe('CommentThread', () => {
  it('renders one row per comment with author labels', () => {
    render(<CommentThread comments={[c1, c2]} onSend={vi.fn()} />)
    expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
    expect(screen.getByText('Dana')).toBeInTheDocument()
    expect(screen.getByText('Mgr')).toBeInTheDocument()
  })
  it('calls onSend with the typed body and clears', async () => {
    const onSend = vi.fn()
    render(<CommentThread comments={[c1]} onSend={onSend} />)
    await userEvent.type(screen.getByTestId('comment-composer-input'), 'thanks')
    await userEvent.click(screen.getByTestId('comment-composer-send'))
    expect(onSend).toHaveBeenCalledWith('thanks')
  })
  it('hides the composer when readOnly', () => {
    render(<CommentThread comments={[c1]} onSend={vi.fn()} readOnly />)
    expect(screen.queryByTestId('comment-composer')).toBeNull()
  })
  it('submits on Cmd+Enter (metaKey)', async () => {
    const onSend = vi.fn()
    render(<CommentThread comments={[c1]} onSend={onSend} />)
    const input = screen.getByTestId('comment-composer-input')
    fireEvent.change(input, { target: { value: 'thanks' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('thanks'))
  })
  it('submits on Ctrl+Enter (ctrlKey)', async () => {
    const onSend = vi.fn()
    render(<CommentThread comments={[c1]} onSend={onSend} />)
    const input = screen.getByTestId('comment-composer-input')
    fireEvent.change(input, { target: { value: 'ship it' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('ship it'))
  })
  it('does NOT submit on a plain Enter (newline, no modifier)', () => {
    const onSend = vi.fn()
    render(<CommentThread comments={[c1]} onSend={onSend} />)
    const input = screen.getByTestId('comment-composer-input')
    fireEvent.change(input, { target: { value: 'a note' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
  it('does NOT submit an empty comment on Cmd+Enter', () => {
    const onSend = vi.fn()
    render(<CommentThread comments={[c1]} onSend={onSend} />)
    fireEvent.keyDown(screen.getByTestId('comment-composer-input'), {
      key: 'Enter',
      metaKey: true,
    })
    expect(onSend).not.toHaveBeenCalled()
  })
})
