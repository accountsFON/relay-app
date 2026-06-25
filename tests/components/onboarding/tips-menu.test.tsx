import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TipsMenu } from '@/components/onboarding/tips-menu'

const start = vi.fn()
const push = vi.fn()
let pathname = '/somewhere-else'
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
  pathname = '/somewhere-else'
})

describe('TipsMenu', () => {
  it('shows the Tips button and toggles the role-labeled walkthrough list', async () => {
    render(<TipsMenu role="account_manager" />)
    expect(screen.getByTestId('tips-button')).toBeInTheDocument()
    expect(screen.queryByTestId('tips-menu')).not.toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('tips-button')) })
    expect(screen.getByTestId('tips-menu')).toBeInTheDocument()
    expect(screen.getByTestId('tips-tour-overview-v1')).toHaveTextContent(
      'Account Manager Walkthrough',
    )
  })

  it('labels the walkthrough for the designer role', async () => {
    render(<TipsMenu role="designer" />)
    await act(async () => { fireEvent.click(screen.getByTestId('tips-button')) })
    expect(screen.getByTestId('tips-tour-overview-v1')).toHaveTextContent(
      'Designer Walkthrough',
    )
  })

  it('replays a walkthrough: routes to its home then starts it', async () => {
    render(<TipsMenu role="account_manager" />)
    await act(async () => { fireEvent.click(screen.getByTestId('tips-button')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tips-tour-overview-v1')) })
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(start).toHaveBeenCalledWith('overview-v1')
  })

  it('starts without navigating when already on the tour home route', async () => {
    pathname = '/dashboard'
    render(<TipsMenu role="account_manager" />)
    await act(async () => { fireEvent.click(screen.getByTestId('tips-button')) })
    await act(async () => { fireEvent.click(screen.getByTestId('tips-tour-overview-v1')) })
    expect(push).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledWith('overview-v1')
  })

  it('renders nothing for the client role', () => {
    const { container } = render(<TipsMenu role="client" />)
    expect(container).toBeEmptyDOMElement()
  })
})
