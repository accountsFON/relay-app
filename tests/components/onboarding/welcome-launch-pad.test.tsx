import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  WelcomeLaunchPad,
  type LaunchPadCard,
} from '@/components/onboarding/welcome-launch-pad'

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

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  routerMock.push.mockReset()
  routerMock.refresh.mockReset()
  pathnameMock.mockReturnValue('/welcome')
  // The launch pad navigates via a full-document load (window.location) to
  // bypass the client route cache; jsdom's location is non-configurable, so
  // stub the whole object.
  assign = vi.fn()
  vi.stubGlobal('location', { assign, href: '', origin: 'http://localhost' })
})

afterEach(() => {
  vi.unstubAllGlobals()
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

    // Navigation happens AFTER the dismiss persists (awaited).
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/clients/new'),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
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
    await waitFor(() =>
      expect(assign).toHaveBeenLastCalledWith('/batches/cuid_batch_1'),
    )

    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-pass-to-am'))
    await waitFor(() =>
      expect(assign).toHaveBeenLastCalledWith('/batches/cuid_batch_1'),
    )

    fireEvent.click(screen.getByTestId('welcome-launch-pad-card-open-queue'))
    // open-queue is NOT overridden; should use its own href
    await waitFor(() =>
      expect(assign).toHaveBeenLastCalledWith('/dashboard'),
    )
  })

  it('Skip fires onDismiss and pushes /dashboard', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('welcome-launch-pad-skip'))
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/dashboard'),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('Take the tour fires onDismiss and navigates to /dashboard', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('welcome-launch-pad-take-tour'))
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/dashboard'),
    )
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('awaits the dismiss BEFORE navigating, via a full-document load (single click)', async () => {
    // Regression: the dismiss used to be fire-and-forget + a soft router.push,
    // so the first click navigated before launchPadDismissed persisted (and
    // reused a stale prefetched redirect), the (app) gate bounced it back to
    // /welcome, and only a second click worked. Now: await dismiss, then a
    // full-document navigation that ignores the client route cache.
    const order: string[] = []
    const onDismiss = vi.fn(() => {
      order.push('dismiss')
      return Promise.resolve()
    })
    assign.mockImplementation(() => {
      order.push('nav')
    })
    render(<WelcomeLaunchPad cards={cards} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId('welcome-launch-pad-take-tour'))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(order).toEqual(['dismiss', 'nav'])
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
