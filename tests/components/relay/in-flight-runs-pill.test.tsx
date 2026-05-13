import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InFlightRunsPill } from '@/components/relay/in-flight-runs-pill'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: vi.fn(),
}))
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

vi.mock('@/server/actions/in-flight-runs', () => ({
  retryFailedRunAction: vi.fn(),
  acknowledgeFailedRunAction: vi.fn(),
}))
import { retryFailedRunAction, acknowledgeFailedRunAction } from '@/server/actions/in-flight-runs'

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

  it('failed run row renders Retry and Dismiss buttons', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'failed', status: 'failed', errorMessage: 'Timeout' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    expect(screen.getByRole('button', { name: /^Retry$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dismiss$/ })).toBeInTheDocument()
  })

  it('active run row does NOT render Retry or Dismiss buttons', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'active', status: 'running' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    expect(screen.queryByRole('button', { name: /^Retry$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss$/ })).not.toBeInTheDocument()
  })

  it('awaiting_choice run row does NOT render Retry or Dismiss buttons', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'awaiting_choice', status: 'complete' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    expect(screen.queryByRole('button', { name: /^Retry$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss$/ })).not.toBeInTheDocument()
  })

  it('clicking Retry calls retryFailedRunAction(runId) and refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    vi.mocked(retryFailedRunAction).mockResolvedValue({ newRunId: 'r-new' })
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', intent: 'failed', status: 'failed', errorMessage: 'Oops' })],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    await user.click(screen.getByRole('button', { name: /^Retry$/ }))

    await waitFor(() => expect(retryFailedRunAction).toHaveBeenCalledWith('r1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('clicking Dismiss calls acknowledgeFailedRunAction(runId) and refresh', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    vi.mocked(acknowledgeFailedRunAction).mockResolvedValue({ success: true })
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', intent: 'failed', status: 'failed', errorMessage: 'Oops' })],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    await user.click(screen.getByRole('button', { name: /^Dismiss$/ }))

    await waitFor(() => expect(acknowledgeFailedRunAction).toHaveBeenCalledWith('r1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows inline error when Retry throws', async () => {
    const refresh = vi.fn()
    vi.mocked(retryFailedRunAction).mockRejectedValue(new Error('Server error'))
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', intent: 'failed', status: 'failed', errorMessage: 'Oops' })],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    await user.click(screen.getByRole('button', { name: /^Retry$/ }))

    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument())
  })

  it('disables both buttons while a retry is in flight', async () => {
    let resolveRetry!: (value: { newRunId: string }) => void
    vi.mocked(retryFailedRunAction).mockImplementation(
      () =>
        new Promise<{ newRunId: string }>((resolve) => {
          resolveRetry = resolve
        }),
    )
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', intent: 'failed', status: 'failed', errorMessage: 'Oops' })],
      isLoading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    const retryBtn = screen.getByRole('button', { name: /^Retry$/ })
    const dismissBtn = screen.getByRole('button', { name: /^Dismiss$/ })

    await user.click(retryBtn)

    await waitFor(() => expect(screen.getByText('Retrying…')).toBeInTheDocument())
    expect(screen.getByText('Retrying…').closest('button')).toBeDisabled()
    expect(dismissBtn).toBeDisabled()

    resolveRetry({ newRunId: 'r-new' })
  })

  it('wraps active rows in a Link to the client page', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    const link = screen.getByRole('link', { name: /Cedar Creek/i })
    expect(link).toHaveAttribute('href', '/clients/c1')
  })

  it('wraps awaiting_choice rows in a Link to the client page', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c2', intent: 'awaiting_choice' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    const link = screen.getByRole('link', { name: /Cedar Creek/i })
    expect(link).toHaveAttribute('href', '/clients/c2')
  })

  it('failed rows are not links (Retry/Dismiss buttons present instead)', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', intent: 'failed', errorMessage: 'boom' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    expect(screen.queryByRole('link', { name: /Cedar Creek/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
  })

  it('clicking an active row closes the popover', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))

    const link = screen.getByRole('link', { name: /Cedar Creek/i })
    await user.click(link)

    expect(screen.queryByText(/1 run in flight/i)).not.toBeInTheDocument()
  })

  it('clicking an awaiting_choice row removes it from the pill', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', clientName: 'Cedar Creek', intent: 'awaiting_choice' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    const { container } = render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    const link = screen.getByRole('link', { name: /Cedar Creek/i })
    await user.click(link)

    // After acknowledging the only run, the pill should render null.
    expect(container.firstChild).toBeNull()
  })

  it('clicking an active row keeps it in the pill (still in flight)', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', clientName: 'Cedar Creek', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    const link = screen.getByRole('link', { name: /Cedar Creek/i })
    await user.click(link)
    // Re-open the popover.
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    expect(screen.getByText('Cedar Creek')).toBeInTheDocument()
  })

  it('the pill count drops by 1 when an awaiting_choice row is acknowledged', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({ id: 'r1', clientId: 'c1', clientName: 'Cedar Creek', intent: 'awaiting_choice' }),
        mkRun({ id: 'r2', clientId: 'c2', clientName: 'Apex', intent: 'active' }),
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /2 runs/i }))
    await user.click(screen.getByRole('link', { name: /Cedar Creek/i }))
    // Pill now shows 1 run (Apex) only.
    expect(screen.getByRole('button', { name: /1 run/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /2 runs/i })).not.toBeInTheDocument()
  })
})
