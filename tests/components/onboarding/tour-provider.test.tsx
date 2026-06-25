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
