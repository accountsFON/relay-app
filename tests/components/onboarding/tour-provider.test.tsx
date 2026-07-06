import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TourProvider, useTourController } from '@/components/onboarding/tour-provider'

let pathname = '/dashboard'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))
vi.mock('@/hooks/use-is-mobile', () => ({ useIsMobile: () => false }))

beforeEach(() => {
  pathname = '/dashboard'
})

function Harness() {
  const { start } = useTourController()
  return (
    <button data-testid="manual-start" onClick={() => start('overview-v1')}>
      start
    </button>
  )
}

describe('TourProvider', () => {
  it('auto-fires the overview on /dashboard for an unseen AM', () => {
    render(
      <TourProvider role="account_manager" seenTours={[]} onMarkSeen={vi.fn()}>
        <div />
      </TourProvider>,
    )
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
    expect(screen.getByTestId('tour-popover-stop-overview-nav')).toBeInTheDocument()
  })

  it('does not auto-fire when overview-v1 is already seen', () => {
    render(
      <TourProvider role="account_manager" seenTours={['overview-v1']} onMarkSeen={vi.fn()}>
        <div />
      </TourProvider>,
    )
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('does not auto-fire for the client role', () => {
    render(
      <TourProvider role="client" seenTours={[]} onMarkSeen={vi.fn()}>
        <div />
      </TourProvider>,
    )
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('does not auto-fire on a route with no tour', () => {
    pathname = '/settings/org'
    render(
      <TourProvider role="account_manager" seenTours={[]} onMarkSeen={vi.fn()}>
        <div />
      </TourProvider>,
    )
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('fires the scheduling tour on the relay route when its anchor is present', () => {
    pathname = '/clients/abc/batches/xyz'
    render(
      <div>
        <div data-tour-anchor="schedule-nectrcrm" />
        <TourProvider role="account_manager" seenTours={[]} onMarkSeen={vi.fn()}>
          <div />
        </TourProvider>
      </div>,
    )
    expect(screen.getByTestId('tour-popover-stop-schedule-export')).toBeInTheDocument()
  })

  it('falls back to the relay-page tour when the scheduling anchor is absent', () => {
    pathname = '/clients/abc/batches/xyz'
    render(
      <TourProvider role="account_manager" seenTours={[]} onMarkSeen={vi.fn()}>
        <div />
      </TourProvider>,
    )
    expect(screen.getByTestId('tour-popover-stop-batch-track')).toBeInTheDocument()
  })

  it('marks the tour seen on finish and stops re-firing', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    render(
      <TourProvider role="account_manager" seenTours={[]} onMarkSeen={onMarkSeen}>
        <div />
      </TourProvider>,
    )
    // 5 AM stops: click Next until the popover closes.
    for (let i = 0; i < 5; i++) {
      const next = screen.queryByTestId('tour-popover-next')
      if (!next) break
      await act(async () => { fireEvent.click(next) })
    }
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    expect(onMarkSeen).toHaveBeenCalledWith('overview-v1')
  })

  it('can be started manually via the controller (replay)', async () => {
    render(
      <TourProvider role="account_manager" seenTours={['overview-v1']} onMarkSeen={vi.fn()}>
        <Harness />
      </TourProvider>,
    )
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('manual-start')) })
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
  })
})

function StartConsumer({ id }: { id: string }) {
  const { activeTourId, startIfUnseen } = useTourController()
  return (
    <div>
      <span data-testid="active">{activeTourId ?? 'none'}</span>
      <button onClick={() => startIfUnseen(id)}>go</button>
    </div>
  )
}

describe('startIfUnseen', () => {
  it('starts an unseen tour', () => {
    // Use a pathname that matches no auto-fire tour so nothing fires on mount
    // and the initial active state is genuinely 'none'.
    pathname = '/settings/account'
    render(
      <TourProvider role="designer" seenTours={[]} onMarkSeen={() => {}}>
        <StartConsumer id="batch-detail-v1" />
      </TourProvider>,
    )
    expect(screen.getByTestId('active')).toHaveTextContent('none')
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByTestId('active')).toHaveTextContent('batch-detail-v1')
  })

  it('is a no-op when the tour is already seen', () => {
    // Same non-matching pathname: no auto-fire, so state stays 'none'.
    pathname = '/settings/account'
    render(
      <TourProvider role="designer" seenTours={['batch-detail-v1']} onMarkSeen={() => {}}>
        <StartConsumer id="batch-detail-v1" />
      </TourProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(screen.getByTestId('active')).toHaveTextContent('none')
  })
})
