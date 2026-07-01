import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayCompletedBanner } from '@/components/relay/relay-completed-banner'

describe('RelayCompletedBanner', () => {
  it('shows the completed/locked message and the date, with no restore button', () => {
    render(<RelayCompletedBanner completedAt={new Date('2026-07-01T00:00:00Z')} />)
    expect(screen.getByText(/this relay is completed/i)).toBeInTheDocument()
    expect(screen.getByText(/no longer be edited/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
  })
  it('renders without a date', () => {
    render(<RelayCompletedBanner completedAt={null} />)
    expect(screen.getByText(/this relay is completed/i)).toBeInTheDocument()
  })
})
