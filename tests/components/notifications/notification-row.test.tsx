import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationRow } from '@/components/notifications/notification-row'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, prefetch: vi.fn() }) }))

const markReadMock = vi.fn()
const clearMock = vi.fn()
const closeMock = vi.fn()
vi.mock('@/components/notifications/notification-provider', () => ({
  useNotifications: () => ({ markRead: markReadMock, clear: clearMock, closeDropdown: closeMock }),
}))

const SAMPLE = {
  eventId: 'e1',
  mentionId: 'm1',
  kind: 'batch_passed',
  summary: 'Mollie passed Cedar Creek to you.',
  // href already carries the anchor fragment from resolveHref.
  href: '/clients/c1/batches/b1#comment-e1',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  runId: null,
}

describe('NotificationRow', () => {
  beforeEach(() => {
    pushMock.mockReset()
    markReadMock.mockReset()
    clearMock.mockReset()
    closeMock.mockReset()
  })

  it('renders the summary text and relative timestamp', () => {
    render(<NotificationRow item={SAMPLE} />)
    expect(screen.getByText('Mollie passed Cedar Creek to you.')).toBeInTheDocument()
    expect(screen.getByText(/1m ago/i)).toBeInTheDocument()
  })

  it('on main-row click: calls markRead, navigates to item.href verbatim, closes dropdown', () => {
    render(<NotificationRow item={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /Mollie passed Cedar Creek/i }))
    expect(markReadMock).toHaveBeenCalledWith('e1')
    expect(pushMock).toHaveBeenCalledWith('/clients/c1/batches/b1#comment-e1')
    expect(closeMock).toHaveBeenCalled()
  })

  it('dismiss button: clears via the provider without navigating or marking read', () => {
    render(<NotificationRow item={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(clearMock).toHaveBeenCalledWith('e1')
    expect(pushMock).not.toHaveBeenCalled()
    expect(markReadMock).not.toHaveBeenCalled()
  })

  it('shows the unread dot for unread items', () => {
    const { container } = render(<NotificationRow item={SAMPLE} />)
    expect(container.querySelector('[data-testid="unread-dot"]')).not.toBeNull()
  })
})
