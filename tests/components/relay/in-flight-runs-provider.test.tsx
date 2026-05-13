import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { InFlightRunsProvider, useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { listInFlightRuns } from '@/server/actions/in-flight-runs'

vi.mock('@/server/actions/in-flight-runs', () => ({
  listInFlightRuns: vi.fn(),
}))

function TestProbe() {
  const { runs, isLoading } = useInFlightRuns()
  return (
    <div>
      <span data-testid="count">{runs.length}</span>
      <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
    </div>
  )
}

const mockRun = {
  id: 'r1',
  clientId: 'c1',
  clientName: 'Cedar',
  targetMonth: '2026-06',
  intent: 'active' as const,
  status: 'running',
  brief: false,
  crawledContent: false,
  supportingFacts: false,
  postCount: 0,
  errorMessage: null,
  startedAt: new Date().toISOString(),
  targetBatchId: null,
}

describe('InFlightRunsProvider', () => {
  beforeEach(() => {
    // shouldAdvanceTime: true lets waitFor's internal setTimeout still fire
    // while we control setInterval for polling.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listInFlightRuns).mockResolvedValue([])
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('fetches once on mount and stays idle when result is empty', async () => {
    render(
      <InFlightRunsProvider>
        <TestProbe />
      </InFlightRunsProvider>
    )

    // Allow the initial fetch to settle.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByTestId('count').textContent).toBe('0')
    expect(listInFlightRuns).toHaveBeenCalledTimes(1)

    // Advance 10s. No additional polls should fire because list is empty.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(listInFlightRuns).toHaveBeenCalledTimes(1)
  })

  it('starts polling at 2s when at least one run is present', async () => {
    vi.mocked(listInFlightRuns).mockResolvedValue([mockRun])

    render(
      <InFlightRunsProvider>
        <TestProbe />
      </InFlightRunsProvider>
    )

    // Wait for initial fetch to settle.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))
    expect(listInFlightRuns).toHaveBeenCalledTimes(1)

    // Advance 2s, expect one more poll.
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(listInFlightRuns).toHaveBeenCalledTimes(2)

    // Advance another 2s, another poll.
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(listInFlightRuns).toHaveBeenCalledTimes(3)
  })

  it('stops polling when list transitions to empty', async () => {
    vi.mocked(listInFlightRuns).mockResolvedValueOnce([mockRun]).mockResolvedValue([])

    render(
      <InFlightRunsProvider>
        <TestProbe />
      </InFlightRunsProvider>
    )

    // Initial fetch returns the run.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

    // First poll returns empty.
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'))

    // No further polls.
    const callsAfterEmpty = vi.mocked(listInFlightRuns).mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(listInFlightRuns).toHaveBeenCalledTimes(callsAfterEmpty)
  })

  it('refetches on visibilitychange to visible', async () => {
    vi.mocked(listInFlightRuns).mockResolvedValue([])

    render(
      <InFlightRunsProvider>
        <TestProbe />
      </InFlightRunsProvider>
    )

    // Wait for initial fetch.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await waitFor(() => expect(listInFlightRuns).toHaveBeenCalledTimes(1))

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await waitFor(() => expect(listInFlightRuns).toHaveBeenCalledTimes(2))
  })

  it('captures fetch errors and exposes them via context', async () => {
    const fetchErr = new Error('boom')
    vi.mocked(listInFlightRuns).mockRejectedValue(fetchErr)

    function ErrorProbe() {
      const { error, isLoading } = useInFlightRuns()
      return (
        <div>
          <span data-testid="error">{error?.message ?? 'none'}</span>
          <span data-testid="loading">{isLoading ? 'yes' : 'no'}</span>
        </div>
      )
    }

    // Silence the expected console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <InFlightRunsProvider>
        <ErrorProbe />
      </InFlightRunsProvider>
    )

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('boom'))
    expect(screen.getByTestId('loading').textContent).toBe('no')
    expect(consoleSpy).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
