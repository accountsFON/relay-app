import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import React from 'react'
import {
  CompletionNotificationsProvider,
  CompletionNotificationsBanner,
  useCompletionNotifications,
  type PushInput,
} from '@/components/relay/completion-notifications'

// ---------------------------------------------------------------------------
// Mock Next.js Link so it renders a plain <a> in jsdom
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkInput(overrides: Partial<PushInput> = {}): PushInput {
  return {
    clientName: 'Cedar Creek Dental',
    targetMonth: '2026-05',
    clientId: 'c1',
    batchId: 'b1',
    ...overrides,
  }
}

function renderWithProvider() {
  const utils = renderHook(() => useCompletionNotifications(), {
    wrapper: ({ children }) => (
      <CompletionNotificationsProvider>{children}</CompletionNotificationsProvider>
    ),
  })
  return utils
}

// ---------------------------------------------------------------------------
// Provider state tests (1 – 5)
// ---------------------------------------------------------------------------

describe('CompletionNotificationsProvider', () => {
  it('1. push creates a single notification', () => {
    const { result } = renderWithProvider()

    act(() => {
      result.current.push(mkInput())
    })

    expect(result.current.notifications).toHaveLength(1)
    const n = result.current.notifications[0]
    expect(n.kind).toBe('single')
    if (n.kind === 'single') {
      expect(n.clientName).toBe('Cedar Creek Dental')
      expect(n.targetMonth).toBe('2026-05')
      expect(n.href).toBe('/clients/c1/batches/b1')
    }
  })

  it('2. second push aggregates into "[2] Clients" entry, count=2', () => {
    const { result } = renderWithProvider()

    act(() => {
      result.current.push(mkInput({ clientName: 'Client A', clientId: 'c1', batchId: 'b1' }))
    })
    act(() => {
      result.current.push(mkInput({ clientName: 'Client B', clientId: 'c2', batchId: 'b2' }))
    })

    expect(result.current.notifications).toHaveLength(1)
    const n = result.current.notifications[0]
    expect(n.kind).toBe('aggregated')
    if (n.kind === 'aggregated') {
      expect(n.count).toBe(2)
      expect(n.href).toBe('/clients')
    }
  })

  it('3. third push grows aggregated count to 3', () => {
    const { result } = renderWithProvider()

    act(() => { result.current.push(mkInput({ clientId: 'c1', batchId: 'b1' })) })
    act(() => { result.current.push(mkInput({ clientId: 'c2', batchId: 'b2' })) })
    act(() => { result.current.push(mkInput({ clientId: 'c3', batchId: 'b3' })) })

    expect(result.current.notifications).toHaveLength(1)
    const n = result.current.notifications[0]
    expect(n.kind).toBe('aggregated')
    if (n.kind === 'aggregated') {
      expect(n.count).toBe(3)
    }
  })

  it('4. dismissing a single removes it', () => {
    const { result } = renderWithProvider()

    act(() => {
      result.current.push(mkInput())
    })
    expect(result.current.notifications).toHaveLength(1)
    const id = result.current.notifications[0].id

    act(() => {
      result.current.dismiss(id)
    })
    expect(result.current.notifications).toHaveLength(0)
  })

  it('5. dismissing aggregated removes it entirely (does not re-expand)', () => {
    const { result } = renderWithProvider()

    act(() => { result.current.push(mkInput({ clientId: 'c1', batchId: 'b1' })) })
    act(() => { result.current.push(mkInput({ clientId: 'c2', batchId: 'b2' })) })

    expect(result.current.notifications).toHaveLength(1)
    const id = result.current.notifications[0].id

    act(() => {
      result.current.dismiss(id)
    })
    expect(result.current.notifications).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Banner UI tests (6 – 11)
// ---------------------------------------------------------------------------

describe('CompletionNotificationsBanner', () => {
  // Wrap push/dismiss in a test harness that lets us call them imperatively.
  // We call onReady during render (not in useEffect) so it works with fake timers.
  function TestHarness({ onReady }: { onReady: (api: ReturnType<typeof useCompletionNotifications>) => void }) {
    const api = useCompletionNotifications()
    onReady(api)
    return <CompletionNotificationsBanner />
  }

  function renderBanner() {
    let api!: ReturnType<typeof useCompletionNotifications>
    render(
      <CompletionNotificationsProvider>
        <TestHarness onReady={(a) => { api = a }} />
      </CompletionNotificationsProvider>
    )
    return { getApi: () => api }
  }

  it('6. renders single message in correct format', () => {
    const { getApi } = renderBanner()

    act(() => {
      getApi().push({ clientName: 'Cedar Creek Dental', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' })
    })

    expect(screen.getByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).toBeInTheDocument()
  })

  it('7. renders aggregated message with count', () => {
    const { getApi } = renderBanner()

    act(() => { getApi().push({ clientName: 'A', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' }) })
    act(() => { getApi().push({ clientName: 'B', targetMonth: '2026-06', clientId: 'c2', batchId: 'b2' }) })

    expect(screen.getByText('2 Clients are ready to view')).toBeInTheDocument()
  })

  it('8. clicking the link calls dismiss + navigates (verify href)', async () => {
    const { getApi } = renderBanner()

    act(() => {
      getApi().push({ clientName: 'Cedar Creek Dental', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' })
    })

    const link = screen.getByRole('link', { name: /cedar creek dental/i })
    expect(link).toHaveAttribute('href', '/clients/c1/batches/b1')

    const user = userEvent.setup()
    await user.click(link)

    // After click, the notification should be dismissed (removed from DOM).
    expect(screen.queryByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).not.toBeInTheDocument()
  })

  it('9. clicking the X dismisses without navigating', async () => {
    const { getApi } = renderBanner()

    act(() => {
      getApi().push({ clientName: 'Cedar Creek Dental', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' })
    })

    const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
    const user = userEvent.setup()
    await user.click(dismissBtn)

    expect(screen.queryByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).not.toBeInTheDocument()
    // The link should also be gone, confirming no navigation artifact remains.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  describe('timer-based tests', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.clearAllTimers()
    })

    afterEach(() => {
      vi.clearAllTimers()
      vi.useRealTimers()
    })

    it('10. auto-dismisses after 8 seconds (fake timers)', () => {
      const { getApi } = renderBanner()

      act(() => {
        getApi().push({ clientName: 'Cedar Creek Dental', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' })
      })

      expect(screen.getByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(8000)
      })

      expect(screen.queryByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).not.toBeInTheDocument()
    })

    it('11. hover pauses the timer', () => {
      const { getApi } = renderBanner()

      act(() => {
        getApi().push({ clientName: 'Cedar Creek Dental', targetMonth: '2026-05', clientId: 'c1', batchId: 'b1' })
      })

      const card = screen.getByRole('status')

      // Hover over the card — timer should pause.
      // Use fireEvent which properly triggers React synthetic event handlers.
      act(() => {
        fireEvent.mouseEnter(card)
      })

      // Advance past the 8s mark — notification must still be present.
      act(() => {
        vi.advanceTimersByTime(10000)
      })

      expect(screen.getByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).toBeInTheDocument()

      // Mouse leave — timer restarts. Advance another 8s — now it should dismiss.
      act(() => {
        fireEvent.mouseLeave(card)
      })
      act(() => {
        vi.advanceTimersByTime(8000)
      })

      expect(screen.queryByText('Cedar Creek Dental Posts for May, 2026 is ready to view')).not.toBeInTheDocument()
    })
  })
})
