import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep } from '@prisma/client'
import { KanbanCard } from '@/components/relay/kanban-card'

function baseBatch() {
  return {
    id: 'batch-1',
    clientId: 'client-1',
    label: 'May 2026',
    currentStep: RelayStep.copy,
    currentSubState: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    client: { name: 'Cedar Creek Dental' },
    holder: { name: 'Morgan' },
    revisionPlan: null,
  }
}

describe('KanbanCard archived state', () => {
  it('does not render an archived pill on a live batch', () => {
    render(<KanbanCard batch={baseBatch()} />)
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument()
  })

  it('renders an archived pill and opacity when deletedAt is set', () => {
    const archived = { ...baseBatch(), deletedAt: new Date('2026-05-10T00:00:00Z') }
    render(<KanbanCard batch={archived} />)
    expect(screen.getByText(/archived/i)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link.getAttribute('data-archived')).toBe('true')
    expect(link.className).toMatch(/opacity-60/)
  })

  it('treats null deletedAt as live', () => {
    const live = { ...baseBatch(), deletedAt: null }
    render(<KanbanCard batch={live} />)
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument()
  })
})
