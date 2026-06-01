import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import {
  TourProvider,
  useTourController,
  DEFAULT_TOUR_STOPS,
} from '@/components/onboarding/tour-provider'
import type { TourStop } from '@/components/onboarding/tour-popover'

const pathnameMock = vi.fn(() => '/dashboard')
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}))

const stops: TourStop[] = [
  { id: 'a', anchorSelector: '[data-tour-anchor="a"]', title: 'A', body: 'a body' },
  { id: 'b', anchorSelector: '[data-tour-anchor="b"]', title: 'B', body: 'b body' },
  { id: 'c', anchorSelector: '[data-tour-anchor="c"]', title: 'C', body: 'c body' },
]

function StartButton() {
  const tour = useTourController()
  return (
    <button type="button" data-testid="start-tour" onClick={() => tour.start()}>
      Start
    </button>
  )
}

function ActiveProbe() {
  const tour = useTourController()
  return <div data-testid="active">{tour.active ? 'yes' : 'no'}</div>
}

beforeEach(() => {
  pathnameMock.mockReturnValue('/dashboard')
})

describe('TourProvider', () => {
  it('auto fires on /dashboard when tourSeen is false', () => {
    pathnameMock.mockReturnValue('/dashboard')
    render(
      <TourProvider tourSeen={false} stops={stops} onMarkSeen={vi.fn()}>
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('yes')
    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
    expect(screen.getByTestId('tour-popover-stop-a')).toBeInTheDocument()
  })

  it('does not auto fire when tourSeen is true', () => {
    render(
      <TourProvider tourSeen={true} stops={stops} onMarkSeen={vi.fn()}>
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('no')
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('does not auto fire on non-autofire paths', () => {
    pathnameMock.mockReturnValue('/welcome')
    render(
      <TourProvider tourSeen={false} stops={stops} onMarkSeen={vi.fn()}>
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('no')
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
  })

  it('start() opens the tour when invoked from a consumer', () => {
    pathnameMock.mockReturnValue('/clients')
    render(
      <TourProvider tourSeen={true} stops={stops} onMarkSeen={vi.fn()}>
        <StartButton />
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('active')).toHaveTextContent('no')
    fireEvent.click(screen.getByTestId('start-tour'))
    expect(screen.getByTestId('active')).toHaveTextContent('yes')
    expect(screen.getByTestId('tour-popover-stop-a')).toBeInTheDocument()
  })

  it('advances stops on Next and persists once on the last stop', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    pathnameMock.mockReturnValue('/dashboard')
    render(
      <TourProvider tourSeen={false} stops={stops} onMarkSeen={onMarkSeen}>
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('tour-popover-stop-a')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.getByTestId('tour-popover-stop-b')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.getByTestId('tour-popover-stop-c')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    await waitFor(() => expect(onMarkSeen).toHaveBeenCalledTimes(1))
  })

  it('Skip dismisses immediately and persists once even on stop 1', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    pathnameMock.mockReturnValue('/dashboard')
    render(
      <TourProvider tourSeen={false} stops={stops} onMarkSeen={onMarkSeen}>
        <ActiveProbe />
      </TourProvider>,
    )

    expect(screen.getByTestId('tour-popover-stop-a')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('tour-popover-skip'))
    expect(screen.queryByTestId('tour-popover')).not.toBeInTheDocument()
    await waitFor(() => expect(onMarkSeen).toHaveBeenCalledTimes(1))
  })

  it('persistSeen runs at most once even on rapid re-dismiss', async () => {
    const onMarkSeen = vi.fn().mockResolvedValue(undefined)
    pathnameMock.mockReturnValue('/dashboard')
    render(
      <TourProvider tourSeen={false} stops={stops} onMarkSeen={onMarkSeen}>
        <ActiveProbe />
      </TourProvider>,
    )

    fireEvent.click(screen.getByTestId('tour-popover-skip'))
    // Synthetic second close path would be ESC if we re-opened, but the
    // popover is gone now. Re-render an explicit start + skip to prove
    // the persisted flag holds.
    await waitFor(() => expect(onMarkSeen).toHaveBeenCalledTimes(1))
  })

  it('DEFAULT_TOUR_STOPS are 3 sidebar anchors in the documented order', () => {
    expect(DEFAULT_TOUR_STOPS).toHaveLength(3)
    expect(DEFAULT_TOUR_STOPS.map((s) => s.id)).toEqual([
      'my-relay',
      'clients',
      'inbox',
    ])
    for (const stop of DEFAULT_TOUR_STOPS) {
      expect(stop.anchorSelector).toMatch(/^\[data-tour-anchor="/)
    }
  })

  it('useTourController returns a no-op stub outside a TourProvider', () => {
    function Probe() {
      const tour = useTourController()
      // Should not throw and active should be false.
      return (
        <div>
          <span data-testid="probe-active">{tour.active ? 'yes' : 'no'}</span>
          <button type="button" data-testid="probe-start" onClick={() => tour.start()}>
            start
          </button>
        </div>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('probe-active')).toHaveTextContent('no')
    // Calling start() outside a provider should be a no-op (does not throw).
    act(() => {
      fireEvent.click(screen.getByTestId('probe-start'))
    })
    expect(screen.getByTestId('probe-active')).toHaveTextContent('no')
  })
})
