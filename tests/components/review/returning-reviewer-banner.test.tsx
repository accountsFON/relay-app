import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReturningReviewerBanner } from '@/components/review/returning-reviewer-banner'

describe('ReturningReviewerBanner', () => {
  it('renders the welcome-back counter with N of M format', () => {
    render(
      <ReturningReviewerBanner itemsReviewed={6} totalPosts={13} />,
    )

    expect(
      screen.getByTestId('returning-reviewer-banner-counter').textContent,
    ).toBe('6 of 13')
    expect(screen.getByText(/Welcome back/i)).toBeInTheDocument()
  })

  it('dismisses and fires onDismiss when the X button is tapped', () => {
    const onDismiss = vi.fn()
    render(
      <ReturningReviewerBanner
        itemsReviewed={3}
        totalPosts={8}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByTestId('returning-reviewer-banner-dismiss'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByTestId('returning-reviewer-banner'),
    ).not.toBeInTheDocument()
  })
})
