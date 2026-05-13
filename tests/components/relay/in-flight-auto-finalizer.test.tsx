import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { InFlightAutoFinalizer } from '@/components/relay/in-flight-auto-finalizer'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: vi.fn(),
}))
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

vi.mock('@/server/actions/finalize-post-generation', () => ({
  finalizePostGenerationAction: vi.fn(),
}))
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'

vi.mock('@/components/relay/completion-notifications', () => ({
  useCompletionNotifications: vi.fn(() => ({ push: vi.fn(), dismiss: vi.fn(), notifications: [] })),
}))

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

describe('InFlightAutoFinalizer', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(finalizePostGenerationAction).mockResolvedValue({ batchId: 'b1' })
  })

  it('auto-finalizes awaiting_choice runs without matchingBatch', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'awaiting_choice', status: 'complete', postCount: 5 })],
      isLoading: false,
      error: null,
      refresh,
    })

    render(<InFlightAutoFinalizer />)

    await waitFor(() => {
      expect(finalizePostGenerationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          choice: 'new',
          runId: 'r1',
          label: expect.any(String),
        })
      )
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('does not fire for awaiting_choice runs WITH matchingBatch', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({
        intent: 'awaiting_choice',
        status: 'complete',
        postCount: 5,
        matchingBatch: { batchId: 'b1', label: 'June 2026', postCount: 3 },
      })],
      isLoading: false,
      error: null,
      refresh,
    })

    render(<InFlightAutoFinalizer />)

    expect(finalizePostGenerationAction).not.toHaveBeenCalled()
  })

  it('does not fire for active or failed runs', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({ id: 'r-active', intent: 'active' }),
        mkRun({ id: 'r-failed', intent: 'failed', errorMessage: 'boom' }),
      ],
      isLoading: false,
      error: null,
      refresh,
    })

    render(<InFlightAutoFinalizer />)

    expect(finalizePostGenerationAction).not.toHaveBeenCalled()
  })

  it('does not double-fire on re-render with the same run', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ intent: 'awaiting_choice', status: 'complete' })],
      isLoading: false,
      error: null,
      refresh,
    })

    const { rerender } = render(<InFlightAutoFinalizer />)
    await waitFor(() => expect(finalizePostGenerationAction).toHaveBeenCalledTimes(1))

    rerender(<InFlightAutoFinalizer />)
    // Allow microtasks to settle.
    await new Promise((r) => setTimeout(r, 50))
    expect(finalizePostGenerationAction).toHaveBeenCalledTimes(1)
  })
})
