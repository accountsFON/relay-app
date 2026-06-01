import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  WelcomeLaunchPad,
  type LaunchPadCard,
} from '@/components/onboarding/welcome-launch-pad'
import { TourProvider } from '@/components/onboarding/tour-provider'

const routerMock = { push: vi.fn(), refresh: vi.fn() }
const pathnameMock = vi.fn(() => '/welcome')
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => pathnameMock(),
}))

const cards: LaunchPadCard[] = [
  { id: 'create-client', title: 'Create your first client', body: 'a', href: '/clients/new', cta: 'Add a client' },
  { id: 'generate-content', title: 'Generate a month of content', body: 'b', href: '/clients', cta: 'Open clients' },
  { id: 'review-batch', title: 'Review and pass a batch', body: 'c', href: '/dashboard', cta: 'See my queue' },
]

const designerCards: LaunchPadCard[] = [
  { id: 'open-queue', title: 'Open your design queue', body: 'q', href: '/dashboard', cta: 'Open queue' },
  { id: 'edit-graphic', title: 'Edit a post graphic', body: 'g', href: '/dashboard', cta: 'Browse batches' },
  { id: 'pass-to-am', title: 'Pass to AM review', body: 'p', href: '/dashboard', cta: 'View batches' },
]

beforeEach(() => {
  routerMock.push.mockReset()
  routerMock.refresh.mockReset()
  pathnameMock.mockReturnValue('/welcome')
})

describe('WelcomeLaunchPad', () => {
  it('renders one button per card', () => {
    render(<WelcomeLaunchPad cards={cards} onDismiss={vi.fn()} />)

    for (const card of cards) {
      expect(
        screen.getByTestId(`welcome-launch-pad-card-${card.id}`),
      ).toBeInTheDocument()
      expect(screen.getByText(card.title)).toBeInTheDocument()
    }
  })

  it('fires onDismiss and routes to card href on card click', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(
      screen.getByTestId('welcome-launch-pad-card-create-client'),
    )

    expect(routerMock.push).toHaveBeenCalledWith('/clients/new')
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('uses designerJumpHref for the edit-graphic and pass-to-am cards', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(
      <WelcomeLaunchPad
        cards={designerCards}
        designerJumpHref="/batches/cuid_batch_1"
        onDismiss={onDismiss}
      />,
    )

    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-edit-graphic'))
    expect(routerMock.push).toHaveBeenLastCalledWith('/batches/cuid_batch_1')

    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-pass-to-am'))
    expect(routerMock.push).toHaveBeenLastCalledWith('/batches/cuid_batch_1')

    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-open-queue'))
    // open-queue is NOT overridden; should use its own href
    expect(routerMock.push).toHaveBeenLastCalledWith('/dashboard')
  })

  it('Skip fires onDismiss and pushes /dashboard', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('welcome-launch-pad-skip'))
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard')
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('Take the tour fires onDismiss, starts the tour, and pushes /dashboard', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(
      <TourProvider tourSeen={true} onMarkSeen={vi.fn()}>
        <WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />
      </TourProvider>,
    )

    fireEvent.click(screen.getByTestId('welcome-launch-pad-take-tour'))
    expect(routerMock.push).toHaveBeenCalledWith('/dashboard')
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })

  it('dismiss runs at most once across rapid clicks', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('welcome-launch-pad-skip'))
    fireEvent.click(screen.getByTestId('welcome-launch-pad-skip'))
    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-create-client'))

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1))
  })
})
