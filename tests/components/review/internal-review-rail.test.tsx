import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InternalReviewRail, type InternalRailRow } from '@/components/review/internal-review-rail'

const rows: InternalRailRow[] = [
  { postId: 'p1', postNumber: 1, thumbnailUrl: '/a.jpg', verdict: 'approved', pinCount: 2 },
  { postId: 'p2', postNumber: 2, thumbnailUrl: null, verdict: 'changes_requested', pinCount: 1 },
  { postId: 'p3', postNumber: 3, thumbnailUrl: '/c.jpg', verdict: 'pending', pinCount: 0 },
]

describe('InternalReviewRail', () => {
  it('renders one row per post with the verdict status label', () => {
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={vi.fn()} />)
    expect(screen.getAllByTestId('internal-rail-row')).toHaveLength(3)
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows the pin count when there are pins and omits it at zero', () => {
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={vi.fn()} />)
    expect(screen.getByText('2 pins')).toBeInTheDocument()
    expect(screen.getByText('1 pin')).toBeInTheDocument()
    expect(screen.queryByText('0 pins')).not.toBeInTheDocument()
  })

  it('calls onSelectPost with the postId when a row is clicked', () => {
    const onSelectPost = vi.fn()
    render(<InternalReviewRail rows={rows} selectedPostId={null} onSelectPost={onSelectPost} />)
    fireEvent.click(screen.getAllByTestId('internal-rail-row')[1])
    expect(onSelectPost).toHaveBeenCalledWith('p2')
  })

  it('marks the selected row aria-current', () => {
    render(<InternalReviewRail rows={rows} selectedPostId="p2" onSelectPost={vi.fn()} />)
    const selected = screen.getAllByTestId('internal-rail-row')[1]
    expect(selected).toHaveAttribute('aria-current', 'true')
  })
})
