import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotificationDropdown } from '@/components/notifications/notification-dropdown'

vi.mock('@/components/notifications/notification-provider', () => ({
  useNotifications: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}))

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/in-flight-runs', () => ({
  retryFailedRunAction: vi.fn(),
  acknowledgeFailedRunAction: vi.fn(),
}))

import { useNotifications } from '@/components/notifications/notification-provider'

function setup(items: unknown[], isOpen = true, count?: number) {
  ;(useNotifications as any).mockReturnValue({
    items,
    count: count ?? items.length,
    isOpen,
    closeDropdown: vi.fn(),
    markRead: vi.fn(),
    error: null,
  })
}

describe('NotificationDropdown', () => {
  it('does not render when isOpen is false', () => {
    setup([], false)
    const { container } = render(<NotificationDropdown />)
    expect(container.firstChild).toBeNull()
  })

  it('shows empty state with no items', () => {
    setup([])
    render(<NotificationDropdown />)
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('renders standard rows for non run_failed items', () => {
    setup([
      { eventId: 'e1', mentionId: 'm1', kind: 'batch_passed', summary: 'A', href: '/x', createdAt: new Date().toISOString(), runId: null },
      { eventId: 'e2', mentionId: 'm2', kind: 'comment', summary: 'B', href: '/y', createdAt: new Date().toISOString(), runId: null },
    ])
    render(<NotificationDropdown />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders FailedRunRow for run_failed kind', () => {
    setup([
      { eventId: 'e1', mentionId: 'm1', kind: 'run_failed', summary: 'June failed', href: '/admin/failed-runs/r1', createdAt: new Date().toISOString(), runId: 'r1' },
    ])
    render(<NotificationDropdown />)
    expect(screen.getByText('June failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
  })

  it('always shows the "See all in inbox" footer when isOpen', () => {
    setup([])
    render(<NotificationDropdown />)
    expect(screen.getByRole('link', { name: /See all in inbox/i })).toHaveAttribute('href', '/inbox')
  })
})
