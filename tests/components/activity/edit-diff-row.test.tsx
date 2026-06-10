import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditDiffRow } from '@/components/activity/edit-diff-row'

describe('EditDiffRow', () => {
  const changes = [
    { field: 'mainCta', from: 'Call now', to: 'Book today' },
    { field: 'assignedAmId', from: 'Mollie', to: 'Caleb' },
  ]

  it('shows the summary header collapsed and reveals per-field from/to on click', () => {
    render(
      <EditDiffRow actorName="Mollie" subject="profile" changes={changes} createdAtLabel="now" />,
    )
    expect(screen.getByText(/edited profile: Main CTA, Account Manager/)).toBeInTheDocument()
    expect(screen.queryByText('Book today')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Main CTA')).toBeInTheDocument()
    expect(screen.getByText('Call now')).toBeInTheDocument()
    expect(screen.getByText('Book today')).toBeInTheDocument()
    expect(screen.getByText('Caleb')).toBeInTheDocument()
  })

  it('uses "post" subject wording', () => {
    render(<EditDiffRow actorName="Mollie" subject="post" changes={[{ field: 'caption', from: 'a', to: 'b' }]} createdAtLabel="now" />)
    expect(screen.getByText(/edited post: Caption/)).toBeInTheDocument()
  })
})
