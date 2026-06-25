import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToursPanel } from '@/components/onboarding/tours-panel'

const start = vi.fn()
const push = vi.fn()
let pathname = '/settings/org'
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTourController: () => ({ start, active: false, activeTourId: null, currentIndex: 0, dismiss: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}))

beforeEach(() => {
  start.mockClear()
  push.mockClear()
  pathname = '/settings/org'
})

describe('ToursPanel', () => {
  it('lists the overview tour for an account_manager and replays it', async () => {
    render(<ToursPanel role="account_manager" />)
    const replay = screen.getByTestId('tour-replay-overview-v1')
    await act(async () => { fireEvent.click(replay) })
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(start).toHaveBeenCalledWith('overview-v1')
  })

  it('starts without navigating when already on the tour home route', async () => {
    pathname = '/dashboard'
    render(<ToursPanel role="account_manager" />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-replay-overview-v1'))
    })
    expect(push).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledWith('overview-v1')
  })

  it('renders nothing actionable for the client role', () => {
    render(<ToursPanel role="client" />)
    expect(screen.queryByTestId('tour-replay-overview-v1')).toBeNull()
  })
})
