import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InternalReviewRail, type InternalRailRow } from '@/components/review/internal-review-rail'

const rows: InternalRailRow[] = [
  { postId: 'p1', postNumber: 1, thumbnailUrl: '/a.jpg', pinStatus: 'open', openCount: 2 },
  { postId: 'p2', postNumber: 2, thumbnailUrl: null, pinStatus: 'resolved', openCount: 0 },
  { postId: 'p3', postNumber: 3, thumbnailUrl: '/c.jpg', pinStatus: 'none', openCount: 0 },
]

describe('InternalReviewRail', () => {
  it('renders one row per post', () => {
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={vi.fn()} />)
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(3)
  })

  it('renders pin state per row', () => {
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={vi.fn()} />)
    expect(screen.getByText('2 open')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByText('0 open')).not.toBeInTheDocument() // 'none' shows no chip
  })

  it('calls onSelectPost with the postId when a row is clicked', () => {
    const onSelectPost = vi.fn()
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={onSelectPost} />)
    fireEvent.click(screen.getAllByTestId('internal-rail-row')[1])
    expect(onSelectPost).toHaveBeenCalledWith('p2')
  })

  it('marks the selected row aria-current', () => {
    render(<InternalReviewRail rows={rows} selectedPostId="p2" onSelectPost={vi.fn()} />)
    const allRows = screen.getAllByTestId('internal-rail-row')
    expect(allRows[1]).toHaveAttribute('aria-current', 'true')
    allRows
      .filter((_, i) => i !== 1)
      .forEach((el) => expect(el).not.toHaveAttribute('aria-current'))
  })
})
