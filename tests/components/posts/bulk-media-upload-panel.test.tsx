import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BulkMediaUploadPanel } from '@/components/posts/bulk-media-upload-panel'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

/**
 * Stub the heavy drag-and-drop tray. We only assert the panel's
 * open/close behavior + that it forwards posts and wires onApplied to a
 * router refresh; the tray's own upload/assign logic is covered by
 * bulk-media-tray.test.tsx.
 */
vi.mock('@/components/posts/bulk-media-tray', () => ({
  BulkMediaTray: (props: {
    posts: ReadonlyArray<{ id: string }>
    onApplied: () => void
  }) => (
    <div data-testid="bulk-media-tray" data-post-count={props.posts.length}>
      <button data-testid="stub-apply" onClick={() => props.onApplied()}>
        apply
      </button>
    </div>
  ),
}))

const day = (mm: number, dd: number): Date => new Date(Date.UTC(2026, mm - 1, dd))
const posts = [
  { id: 'p1', postDate: day(5, 10), caption: 'one' },
  { id: 'p2', postDate: day(5, 12), caption: 'two' },
]

beforeEach(() => {
  refresh.mockClear()
})

describe('BulkMediaUploadPanel', () => {
  it('renders the open button and hides the tray by default', () => {
    render(<BulkMediaUploadPanel batchId="b1" posts={posts} />)
    expect(screen.getByTestId('bulk-media-open')).toBeTruthy()
    expect(screen.queryByTestId('bulk-media-tray')).toBeNull()
  })

  it('opens the tray when the button is clicked, forwarding the posts', () => {
    render(<BulkMediaUploadPanel batchId="b1" posts={posts} />)
    fireEvent.click(screen.getByTestId('bulk-media-open'))
    const tray = screen.getByTestId('bulk-media-tray')
    expect(tray).toBeTruthy()
    expect(tray.dataset.postCount).toBe('2')
  })

  it('collapses back to the button when closed', () => {
    render(<BulkMediaUploadPanel batchId="b1" posts={posts} />)
    fireEvent.click(screen.getByTestId('bulk-media-open'))
    fireEvent.click(screen.getByTestId('bulk-media-close'))
    expect(screen.queryByTestId('bulk-media-tray')).toBeNull()
    expect(screen.getByTestId('bulk-media-open')).toBeTruthy()
  })

  it('refreshes the route after a successful apply', () => {
    render(<BulkMediaUploadPanel batchId="b1" posts={posts} />)
    fireEvent.click(screen.getByTestId('bulk-media-open'))
    fireEvent.click(screen.getByTestId('stub-apply'))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
