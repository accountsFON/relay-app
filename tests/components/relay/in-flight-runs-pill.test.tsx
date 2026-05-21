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
    targetBatchId: null,
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

  it('filters out failed runs and sorts awaiting_choice before active', async () => {
    // After T12, failed runs are surfaced by the notification bell only.
    // The pill shows awaiting_choice + active runs and hides the failed one.
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
    // Failed run is filtered, so the count is 2 not 3.
    await user.click(screen.getByRole('button', { name: /2 runs/i }))

    const rows = screen.getAllByTestId('inflight-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Choice client')
    expect(rows[1]).toHaveTextContent('Active client')
    expect(screen.queryByText('Failed client')).not.toBeInTheDocument()
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

  it('a single failed run hides the pill entirely (failed runs live in the bell only)', () => {
    // After T12, failed runs are owned by the notification bell. The pill should
    // render null when its only run is failed, since no active/awaiting rows remain.
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'failed', status: 'failed', errorMessage: 'Timeout' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    const { container } = render(<InFlightRunsPill />)
    expect(container.firstChild).toBeNull()
  })

  it('a failed run mixed with an active run is omitted from the popover', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({ id: 'r1', clientName: 'Active client', intent: 'active' }),
        mkRun({ id: 'r2', clientName: 'Failed client', intent: 'failed', errorMessage: 'Boom' }),
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightRunsPill />)
    const user = userEvent.setup()
    // Only the active run counts toward the pill label.
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    expect(screen.getByText('Active client')).toBeInTheDocument()
    expect(screen.queryByText('Failed client')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retry$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss$/ })).not.toBeInTheDocument()
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

  // After T12, Retry/Dismiss are no longer surfaced through the pill — the
  // notification bell (FailedRunRow) owns the failed-run actions instead.
  // The 4 tests that exercised retryFailedRunAction / acknowledgeFailedRunAction
  // through the pill have moved to tests/components/notifications/failed-run-row.test.tsx.

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

  it('a lone failed run produces neither a link nor Retry/Dismiss buttons in the pill', () => {
    // After T12, the pill ignores failed runs entirely. Verify no row, no link,
    // no Retry/Dismiss buttons leak through — those live in the bell now.
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'r1', clientId: 'c1', intent: 'failed', errorMessage: 'boom' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    const { container } = render(<InFlightRunsPill />)
    // Pill collapses entirely with no visible runs.
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('link', { name: /Cedar Creek/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Retry$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss$/i })).not.toBeInTheDocument()
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

  it('renders a RunProgressLine for active runs in the popover', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ brief: true, crawledContent: false })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    const user = userEvent.setup()
    render(<InFlightRunsPill />)
    await user.click(screen.getByRole('button', { name: /1 run/i }))
    // RunProgressLine derives this from brief=true, crawledContent=false
    expect(screen.getByText(/Crawling websites/i)).toBeInTheDocument()
  })
})
