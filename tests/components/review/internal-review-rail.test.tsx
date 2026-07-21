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
  onSelectThread: vi.fn(),
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
        onSelectThread={vi.fn()}
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

  // New: navigator counter respects the Changes-only filter
  it('navigator counter only counts threads on visibleRows when Changes-only filter is on', () => {
    const mixedRowsForCounter: InternalRailRow[] = [
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
        threads: [{ id: 't2', label: 'Done thread', status: 'resolved' }],
      },
    ]
    render(
      <InternalReviewRail
        rows={mixedRowsForCounter}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    // Filter off: both threads in counter (1 resolved of 2 total)
    expect(screen.getByTestId('changes-navigator-counter')).toHaveTextContent('1 of 2 resolved')

    // Toggle "Changes only" on: resolved rows STAY (they have feedback), so
    // both rows remain visible and both threads stay in the counter.
    fireEvent.click(screen.getByTestId('changes-navigator-filter'))

    // Filter on: resolved row still counted (1 resolved of 2 total)
    expect(screen.getByTestId('changes-navigator-counter')).toHaveTextContent('1 of 2 resolved')
  })

  // "Changes only" keeps resolved (crossed-out) rows, hiding only posts that
  // never had feedback (pinStatus === 'none').
  it('keeps resolved rows and hides only no-feedback rows when Changes only is on', () => {
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

    // After filter: the open AND resolved rows stay (both have feedback); only
    // the 'none' row (Post 3) is hidden.
    const visibleRows = screen.getAllByTestId('internal-rail-row')
    expect(visibleRows).toHaveLength(2)
    expect(visibleRows[0]).toHaveTextContent('Post 1')
    expect(visibleRows[1]).toHaveTextContent('Post 2')
    expect(screen.queryByText('Post 3')).not.toBeInTheDocument()
  })

  // New: author byline on checklist rows
  it('renders the author byline on a checklist row for AM and client authors', () => {
    const rowsWithBylines: InternalRailRow[] = [
      {
        postId: 'p1',
        postNumber: 1,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 2,
        threads: [
          { id: 't1', label: 'Tighten the crop', status: 'open', author: 'Jane AM' },
          { id: 't2', label: 'Love this shot', status: 'open', author: 'Casey Client' },
        ],
      },
    ]
    render(
      <InternalReviewRail
        rows={rowsWithBylines}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByText('Jane AM')).toBeInTheDocument()
    expect(screen.getByText('Casey Client')).toBeInTheDocument()
  })

  // New: long labels render in full (no hard truncation)
  it('renders a long checklist label in full without truncation', () => {
    const longLabel = 'x'.repeat(120)
    const rowsWithLong: InternalRailRow[] = [
      {
        postId: 'p1',
        postNumber: 1,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 1,
        threads: [{ id: 't1', label: longLabel, status: 'open' }],
      },
    ]
    render(
      <InternalReviewRail
        rows={rowsWithLong}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
      />,
    )
    expect(screen.getByText(longLabel)).toBeInTheDocument()
  })

  it('calls onSelectThread with (threadId, postId) when a comment is clicked', () => {
    const onSelectThread = vi.fn()
    const rowsWithThread: InternalRailRow[] = [
      {
        postId: 'p9',
        postNumber: 9,
        thumbnailUrl: null,
        pinStatus: 'open',
        openCount: 1,
        threads: [{ id: 't9', label: 'change this image', status: 'open' }],
      },
    ]
    render(
      <InternalReviewRail
        rows={rowsWithThread}
        selectedPostId={null}
        onSelectPost={vi.fn()}
        {...defaultProps}
        onSelectThread={onSelectThread}
      />,
    )
    fireEvent.click(screen.getByTestId('internal-rail-resolve-t9-label'))
    expect(onSelectThread).toHaveBeenCalledWith('t9', 'p9')
  })
})
