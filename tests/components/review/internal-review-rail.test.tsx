import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InternalReviewRail, type InternalRailRow } from '@/components/review/internal-review-rail'

const rows: InternalRailRow[] = [
  {
    postId: 'p1',
    postNumber: 1,
    thumbnailUrl: '/a.jpg',
    pinStatus: 'open',
    openCount: 2,
    threads: [],
  },
  {
    postId: 'p2',
    postNumber: 2,
    thumbnailUrl: null,
    pinStatus: 'resolved',
    openCount: 0,
    threads: [],
  },
  {
    postId: 'p3',
    postNumber: 3,
    thumbnailUrl: '/c.jpg',
    pinStatus: 'none',
    openCount: 0,
    threads: [],
  },
]

const defaultProps = {
  onResolveThread: vi.fn(() => Promise.resolve()),
  onUnresolveThread: vi.fn(() => Promise.resolve()),
  onScrollToPost: vi.fn(),
}

describe('InternalReviewRail', () => {
  it('renders one row per post', () => {
    render(
      <InternalReviewRail
        rows={rows}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(3)
  })

  it('renders pin state per row', () => {
    render(
      <InternalReviewRail
        rows={rows}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByText('2 open')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByText('0 open')).not.toBeInTheDocument() // 'none' shows no chip
  })

  it('calls onSelectPost with the postId when a row is clicked', () => {
    const onSelectPost = vi.fn()
    render(
      <InternalReviewRail
        rows={rows}
        selectedPostId={null}
        onSelectPost={onSelectPost}
        {...defaultProps}
      />,
    )
    fireEvent.click(screen.getAllByTestId('internal-rail-row')[1])
    expect(onSelectPost).toHaveBeenCalledWith('p2')
  })

  it('marks the selected row aria-current', () => {
    render(
      <InternalReviewRail
        rows={rows}
        selectedPostId="p2"
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    const allRows = screen.getAllByTestId('internal-rail-row')
    expect(allRows[1]).toHaveAttribute('aria-current', 'true')
    allRows
      .filter((_, i) => i !== 1)
      .forEach((el) => expect(el).not.toHaveAttribute('aria-current'))
  })

  // New: thread checkboxes
  it('renders a resolve checkbox for an open thread and calls onResolveThread on click', () => {
    const onResolveThread = vi.fn(() => Promise.resolve())
    const rowsWithThread: InternalRailRow[] = [
      {
        postId: 'p1',
        postNumber: 1,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 1,
        threads: [{ id: 'thread-abc', label: 'Caption looks off', status: 'open' }],
      },
    ]
    render(
      <InternalReviewRail
        rows={rowsWithThread}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        onResolveThread={onResolveThread}
        onUnresolveThread={vi.fn(() => Promise.resolve())}
        onScrollToPost={vi.fn()}
      />,
    )
    const checkbox = screen.getByTestId('internal-rail-resolve-thread-abc')
    expect(checkbox).toBeInTheDocument()
    fireEvent.click(checkbox)
    expect(onResolveThread).toHaveBeenCalledWith('thread-abc')
  })

  // New: ChangesNavigator counter
  it('renders the ChangesNavigator with a counter derived from threads across rows', () => {
    const rowsWithThreads: InternalRailRow[] = [
      {
        postId: 'p1',
        postNumber: 1,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 2,
        threads: [
          { id: 't1', label: 'First comment', status: 'open' },
          { id: 't2', label: 'Second comment', status: 'resolved' },
        ],
      },
      {
        postId: 'p2',
        postNumber: 2,
        thumbnailUrl: null,
        pinStatus: 'none',
        openCount: 0,
        threads: [],
      },
    ]
    render(
      <InternalReviewRail
        rows={rowsWithThreads}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    // 1 of 2 threads resolved
    expect(screen.getByTestId('changes-navigator-counter')).toHaveTextContent('1 of 2 resolved')
  })

  // New: "Changes only" filter hides non-open rows
  it('hides non-open rows when Changes only filter is toggled on', () => {
    const mixedRows: InternalRailRow[] = [
      {
        postId: 'p1',
        postNumber: 1,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 1,
        threads: [{ id: 't1', label: 'Open thread', status: 'open' }],
      },
      {
        postId: 'p2',
        postNumber: 2,
        thumbnailUrl: null,
        pinStatus: 'resolved',
        openCount: 0,
        threads: [{ id: 't2', label: 'Done', status: 'resolved' }],
      },
      {
        postId: 'p3',
        postNumber: 3,
        thumbnailUrl: null,
        pinStatus: 'none',
        openCount: 0,
        threads: [],
      },
    ]
    render(
      <InternalReviewRail
        rows={mixedRows}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    // Before filter: 3 rows visible
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(3)

    // Toggle filter on
    fireEvent.click(screen.getByTestId('changes-navigator-filter'))

    // After filter: only the 'open' row visible (Post 1)
    const visibleRows = screen.getAllByTestId('internal-rail-row')
    expect(visibleRows).toHaveLength(1)
    expect(visibleRows[0]).toHaveTextContent('Post 1')
  })
})
