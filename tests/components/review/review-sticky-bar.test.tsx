import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReviewStickyBar } from '@/components/review/review-sticky-bar'

describe('ReviewStickyBar', () => {
  it('shows the reviewed/total progress and fires Approve all on click', () => {
    const onApproveAll = vi.fn()
    render(
      <ReviewStickyBar
        reviewed={6}
        total={12}
        allApproved={false}
        pending={false}
        onApproveAll={onApproveAll}
      />,
    )
    expect(screen.getByTestId('review-sticky-bar')).toHaveTextContent('6/12')
    fireEvent.click(screen.getByTestId('approve-all-button'))
    expect(onApproveAll).toHaveBeenCalledTimes(1)
  })

  it('hides the Approve all button for a single-post relay', () => {
    render(
      <ReviewStickyBar
        reviewed={0}
        total={1}
        allApproved={false}
        pending={false}
        onApproveAll={() => {}}
      />,
    )
    expect(screen.getByTestId('review-sticky-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('approve-all-button')).not.toBeInTheDocument()
  })
})
