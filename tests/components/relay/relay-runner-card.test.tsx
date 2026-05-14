import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  RelayRunnerCard,
  type RunnerRelay,
} from '@/components/relay/relay-runner-card'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))

function baseRelay(overrides: Partial<RunnerRelay> = {}): RunnerRelay {
  return {
    id: 'batch-1',
    clientId: 'client-1',
    clientName: 'Cedar Creek Dental',
    label: 'May 2026',
    daysOnStep: 2,
    holder: { id: 'u1', name: 'Morgan' },
    lastTransitionAt: null,
    ...overrides,
  }
}

describe('RelayRunnerCard', () => {
  beforeEach(() => {
    pushMock.mockReset()
  })

  it('renders client name, label, holder, and days at step', () => {
    render(<RelayRunnerCard relay={baseRelay()} />)
    expect(screen.getByText('Cedar Creek Dental')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('Morgan')).toBeInTheDocument()
    expect(screen.getByText('2d')).toBeInTheDocument()
  })

  it('navigates to the relay detail page on click', async () => {
    const user = userEvent.setup()
    render(<RelayRunnerCard relay={baseRelay()} />)
    await user.click(screen.getByRole('link'))
    expect(pushMock).toHaveBeenCalledWith('/clients/client-1/batches/batch-1')
  })

  it('flags relays that passed within the last 24 hours with a baton chip', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const justPassed = new Date('2026-05-12T06:00:00Z') // 6h ago
    render(
      <RelayRunnerCard
        relay={baseRelay({ lastTransitionAt: justPassed })}
        now={now}
      />,
    )
    expect(screen.getByLabelText(/baton just passed/i)).toBeInTheDocument()
    expect(screen.getByRole('link').getAttribute('data-recent')).toBe('true')
  })

  it('does not flag relays that transitioned over 24 hours ago', () => {
    const now = new Date('2026-05-12T12:00:00Z')
    const stale = new Date('2026-05-10T12:00:00Z') // 48h ago
    render(
      <RelayRunnerCard
        relay={baseRelay({ lastTransitionAt: stale })}
        now={now}
      />,
    )
    expect(screen.queryByLabelText(/baton just passed/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link').getAttribute('data-recent')).toBeNull()
  })

  it('does not flag relays with no transition history', () => {
    render(<RelayRunnerCard relay={baseRelay({ lastTransitionAt: null })} />)
    expect(screen.queryByLabelText(/baton just passed/i)).not.toBeInTheDocument()
  })

  it('navigates on Enter key press', async () => {
    const user = userEvent.setup()
    render(<RelayRunnerCard relay={baseRelay()} />)
    screen.getByRole('link').focus()
    await user.keyboard('{Enter}')
    expect(pushMock).toHaveBeenCalledWith('/clients/client-1/batches/batch-1')
  })

  it('renders a checkbox when selectable is true', () => {
    render(
      <RelayRunnerCard
        relay={baseRelay()}
        selectable={true}
        selected={false}
        onToggleSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('does not render a checkbox when selectable is undefined', () => {
    render(<RelayRunnerCard relay={baseRelay()} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('checked state reflects the selected prop', () => {
    render(
      <RelayRunnerCard
        relay={baseRelay()}
        selectable={true}
        selected={true}
        onToggleSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('clicking the checkbox calls onToggleSelect with the relay id', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <RelayRunnerCard
        relay={baseRelay({ id: 'relay-abc' })}
        selectable={true}
        selected={false}
        onToggleSelect={onToggle}
      />,
    )
    await user.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('relay-abc')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('clicking the card body in select mode toggles selection instead of navigating', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <RelayRunnerCard
        relay={baseRelay({ id: 'relay-abc' })}
        selectable={true}
        selected={false}
        onToggleSelect={onToggle}
      />,
    )
    // No role="link" in select mode — click the card by its accessible name
    await user.click(screen.getByLabelText(/Open relay Cedar Creek Dental/i))
    expect(onToggle).toHaveBeenCalledWith('relay-abc')
    expect(pushMock).not.toHaveBeenCalled()
  })
})
