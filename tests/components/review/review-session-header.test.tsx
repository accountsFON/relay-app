import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReviewSessionHeader } from '@/components/review/review-session-header'

describe('ReviewSessionHeader', () => {
  const baseProps = {
    reviewerName: 'Sarah Client',
    reviewerEmail: 'sarah@example.com',
    round: 2,
    submittedAt: new Date('2026-05-15T12:00:00Z'),
    summary: {
      approved: 8,
      changesRequested: 4,
      captionEdited: 1,
      totalPosts: 13,
    },
    backHref: '/clients/client_1/batches/batch_1',
  }

  it('renders reviewer name + email + round badge', () => {
    render(<ReviewSessionHeader {...baseProps} />)
    expect(screen.getByText('Sarah Client')).toBeTruthy()
    expect(screen.getByTestId('review-session-reviewer-email')).toHaveTextContent('sarah@example.com')
    expect(screen.getByTestId('review-session-round-badge')).toHaveTextContent('Round 2')
  })

  it('renders the three summary chips with their counts', () => {
    render(<ReviewSessionHeader {...baseProps} />)
    expect(screen.getByTestId('summary-chip-approved')).toHaveTextContent('8')
    expect(screen.getByTestId('summary-chip-approved')).toHaveTextContent('Approved')
    expect(screen.getByTestId('summary-chip-changes')).toHaveTextContent('4')
    expect(screen.getByTestId('summary-chip-edits')).toHaveTextContent('1')
  })

  it('renders the back link with the supplied href', () => {
    render(<ReviewSessionHeader {...baseProps} />)
    const link = screen.getByTestId('review-session-back-link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/clients/client_1/batches/batch_1')
  })

  it('omits the email line when no email is provided', () => {
    render(<ReviewSessionHeader {...baseProps} reviewerEmail={null} />)
    expect(screen.queryByTestId('review-session-reviewer-email')).toBeNull()
  })
})
