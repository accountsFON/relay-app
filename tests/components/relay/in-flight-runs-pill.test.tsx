import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InFlightRunsPill } from '@/components/relay/in-flight-runs-pill'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: vi.fn(),
}))
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

function mkRun(overrides: Partial<InFlightRun>): InFlightRun {
  return {
    id: 'r1',
    clientId: 'c1',
    clientName: 'Cedar Creek',
    targetMonth: '2026-06',
    intent: 'active',
    status: 'running',
    brief: false,
    crawledContent: false,
    supportingFacts: false,
    postCount: 0,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('InFlightRunsPill', () => {
  it('renders nothing when there are no runs', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({ runs: [], isLoading: false, error: null, refresh: vi.fn() })
    const { container } = render(<InFlightRunsPill />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a count badge when there is at least one run', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({}), mkRun({ id: 'r2', clientName: 'Apex' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    expect(screen.getByText(/2 runs/i)).toBeInTheDocument()
  })

  it('renders singular "1 run" when exactly one run', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({ runs: [mkRun({})], isLoading: false, error: null, refresh: vi.fn() })
    render(<InFlightRunsPill />)
    expect(screen.getByText(/1 run\b/i)).toBeInTheDocument()
  })

  it('opens a popover on click and shows a row per run', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ clientName: 'Cedar Creek' }), mkRun({ id: 'r2', clientName: 'Apex Foods' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /2 runs/i }))

    expect(screen.getByText('Cedar Creek')).toBeInTheDocument()
    expect(screen.getByText('Apex Foods')).toBeInTheDocument()
  })

  it('sorts awaiting_choice first, then active, then failed', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({ id: 'r1', clientName: 'Active client', intent: 'active' }),
        mkRun({ id: 'r2', clientName: 'Failed client', intent: 'failed' }),
        mkRun({ id: 'r3', clientName: 'Choice client', intent: 'awaiting_choice' }),
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /3 runs/i }))

    const rows = screen.getAllByTestId('inflight-row')
    expect(rows[0]).toHaveTextContent('Choice client')
    expect(rows[1]).toHaveTextContent('Active client')
    expect(rows[2]).toHaveTextContent('Failed client')
  })

  it('closes the popover when clicking outside', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({})],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(
      <div>
        <div data-testid="outside">outside</div>
        <InFlightRunsPill />
      </div>
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    expect(screen.getByText('Cedar Creek')).toBeInTheDocument()

    const outside = screen.getByTestId('outside')
    await user.pointer({ target: outside, keys: '[MouseLeft]' })
    expect(screen.queryByText('Cedar Creek')).not.toBeInTheDocument()
  })
})
