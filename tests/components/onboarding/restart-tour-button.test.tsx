import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RestartTourButton } from '@/components/onboarding/restart-tour-button'

const routerMock = { push: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

beforeEach(() => {
  routerMock.push.mockReset()
  routerMock.refresh.mockReset()
})

describe('RestartTourButton', () => {
  it('renders an enabled button by default', () => {
    render(<RestartTourButton onReset={vi.fn()} />)

    const btn = screen.getByTestId('restart-tour-button')
    expect(btn).toBeEnabled()
    expect(btn).toHaveTextContent('Restart guided tour')
  })

  it('fires onReset and navigates to /welcome on click', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined)
    render(<RestartTourButton onReset={onReset} />)

    fireEvent.click(screen.getByTestId('restart-tour-button'))

    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1))
    expect(routerMock.push).toHaveBeenCalledWith('/welcome')
    expect(routerMock.refresh).toHaveBeenCalledTimes(1)
  })

  it('disables itself while the request is in flight', async () => {
    let resolveReset: (() => void) = () => {}
    const onReset = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveReset = res
        }),
    )
    render(<RestartTourButton onReset={onReset} />)

    fireEvent.click(screen.getByTestId('restart-tour-button'))
    expect(screen.getByTestId('restart-tour-button')).toBeDisabled()
    expect(screen.getByTestId('restart-tour-button')).toHaveTextContent(
      'Restarting...',
    )

    resolveReset()
    await waitFor(() => expect(routerMock.push).toHaveBeenCalled())
  })

  it('surfaces an error and re-enables on failure', async () => {
    const onReset = vi.fn().mockRejectedValue(new Error('boom'))
    render(<RestartTourButton onReset={onReset} />)

    fireEvent.click(screen.getByTestId('restart-tour-button'))

    await waitFor(() =>
      expect(screen.getByTestId('restart-tour-button-error')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('restart-tour-button')).toBeEnabled()
    expect(routerMock.push).not.toHaveBeenCalled()
  })
})
