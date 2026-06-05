import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelayStep } from '@prisma/client'
import { KanbanCard } from '@/components/relay/kanban-card'

const archiveBatchMock = vi.fn()
const restoreBatchMock = vi.fn()
const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/app/(app)/trash/actions', () => ({
  archiveBatchAction: (id: string) => archiveBatchMock(id),
  restoreBatchAction: (id: string) => restoreBatchMock(id),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

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
  }
}

describe('KanbanCard archived state', () => {
  beforeEach(() => {
    archiveBatchMock.mockReset()
    restoreBatchMock.mockReset()
    pushMock.mockReset()
    refreshMock.mockReset()
  })

  it('does not render an archived pill on a live batch', () => {
    render(<KanbanCard batch={baseBatch()} />)
    expect(screen.queryByText(/^archived$/i)).not.toBeInTheDocument()
  })

  it('renders an archived pill and opacity when deletedAt is set', () => {
    const archived = { ...baseBatch(), deletedAt: new Date('2026-05-10T00:00:00Z') }
    render(<KanbanCard batch={archived} />)
    expect(screen.getByText(/^archived$/i)).toBeInTheDocument()
    const link = screen.getByRole('link')
    expect(link.getAttribute('data-archived')).toBe('true')
    expect(link.className).toMatch(/opacity-60/)
  })

  it('treats null deletedAt as live', () => {
    const live = { ...baseBatch(), deletedAt: null }
    render(<KanbanCard batch={live} />)
    expect(screen.queryByText(/^archived$/i)).not.toBeInTheDocument()
  })
})

describe('KanbanCard overflow menu', () => {
  beforeEach(() => {
    archiveBatchMock.mockReset()
    restoreBatchMock.mockReset()
    pushMock.mockReset()
    refreshMock.mockReset()
  })

  it('shows "Archive batch" when the batch is live', async () => {
    const user = userEvent.setup()
    render(<KanbanCard batch={baseBatch()} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    expect(
      await screen.findByRole('menuitem', { name: /archive batch/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /restore batch/i }),
    ).not.toBeInTheDocument()
  })

  it('shows "Restore batch" when the batch is archived', async () => {
    const user = userEvent.setup()
    const archived = { ...baseBatch(), deletedAt: new Date('2026-05-10T00:00:00Z') }
    render(<KanbanCard batch={archived} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    expect(
      await screen.findByRole('menuitem', { name: /restore batch/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: /archive batch/i }),
    ).not.toBeInTheDocument()
  })

  it('opens a confirmation dialog before archiving, then calls archiveBatchAction on confirm', async () => {
    const user = userEvent.setup()
    archiveBatchMock.mockResolvedValue(undefined)
    render(<KanbanCard batch={baseBatch()} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: /archive batch/i }),
    )
    expect(
      await screen.findByText(/archive this batch\?/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await waitFor(() => {
      expect(archiveBatchMock).toHaveBeenCalledWith('batch-1')
    })
  })

  it('cancels the archive when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<KanbanCard batch={baseBatch()} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: /archive batch/i }),
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(archiveBatchMock).not.toHaveBeenCalled()
  })

  it('calls restoreBatchAction directly when Restore is clicked (no confirmation)', async () => {
    const user = userEvent.setup()
    restoreBatchMock.mockResolvedValue(undefined)
    const archived = { ...baseBatch(), deletedAt: new Date('2026-05-10T00:00:00Z') }
    render(<KanbanCard batch={archived} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: /restore batch/i }),
    )
    await waitFor(() => {
      expect(restoreBatchMock).toHaveBeenCalledWith('batch-1')
    })
  })
})

describe('KanbanCard navigation', () => {
  beforeEach(() => {
    archiveBatchMock.mockReset()
    restoreBatchMock.mockReset()
    pushMock.mockReset()
    refreshMock.mockReset()
  })

  it('navigates to the batch detail page when the card body is clicked', async () => {
    const user = userEvent.setup()
    render(<KanbanCard batch={baseBatch()} />)
    await user.click(screen.getByRole('link'))
    expect(pushMock).toHaveBeenCalledWith('/clients/client-1/batches/batch-1')
  })

  it('does not navigate when the overflow menu trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<KanbanCard batch={baseBatch()} />)
    await user.click(screen.getByRole('button', { name: /batch options/i }))
    expect(pushMock).not.toHaveBeenCalled()
  })
})
