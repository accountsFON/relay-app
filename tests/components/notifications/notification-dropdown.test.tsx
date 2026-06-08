import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

function setup(
  items: unknown[],
  isOpen = true,
  count?: number,
  opts?: { closeDropdown?: ReturnType<typeof vi.fn>; error?: 'offline' | null },
) {
  ;(useNotifications as any).mockReturnValue({
    items,
    count: count ?? items.length,
    isOpen,
    closeDropdown: opts?.closeDropdown ?? vi.fn(),
    markRead: vi.fn(),
    error: opts?.error ?? null,
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

  it('calls closeDropdown when the "See all in inbox" footer link is clicked', () => {
    const closeDropdown = vi.fn()
    setup([], true, undefined, { closeDropdown })
    render(<NotificationDropdown />)
    fireEvent.click(screen.getByRole('link', { name: /See all in inbox/i }))
    expect(closeDropdown).toHaveBeenCalledTimes(1)
  })

  it('renders the offline banner when error is "offline"', () => {
    setup([], true, undefined, { error: 'offline' })
    render(<NotificationDropdown />)
    expect(screen.getByText(/Connection lost, will retry/i)).toBeInTheDocument()
  })

  it('focuses the dialog panel when isOpen becomes true', () => {
    setup([])
    render(<NotificationDropdown />)
    const panel = screen.getByRole('dialog', { name: /Notifications/i })
    expect(document.activeElement).toBe(panel)
  })

  it('closes on a pointer-down outside the panel', () => {
    const closeDropdown = vi.fn()
    setup([], true, undefined, { closeDropdown })
    render(<NotificationDropdown />)
    fireEvent.pointerDown(document.body)
    expect(closeDropdown).toHaveBeenCalledTimes(1)
  })

  it('does NOT close on a pointer-down inside the panel', () => {
    const closeDropdown = vi.fn()
    setup([], true, undefined, { closeDropdown })
    render(<NotificationDropdown />)
    fireEvent.pointerDown(screen.getByTestId('notification-dropdown'))
    expect(closeDropdown).not.toHaveBeenCalled()
  })

  it('does NOT close on a pointer-down on a bell trigger (its own toggle handles it)', () => {
    const closeDropdown = vi.fn()
    setup([], true, undefined, { closeDropdown })
    const bell = document.createElement('button')
    bell.setAttribute('aria-controls', 'notification-dropdown-desktop')
    document.body.appendChild(bell)
    render(<NotificationDropdown />)
    fireEvent.pointerDown(bell)
    expect(closeDropdown).not.toHaveBeenCalled()
    bell.remove()
  })

  it('closes on Escape', () => {
    const closeDropdown = vi.fn()
    setup([], true, undefined, { closeDropdown })
    render(<NotificationDropdown />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(closeDropdown).toHaveBeenCalledTimes(1)
  })
})
