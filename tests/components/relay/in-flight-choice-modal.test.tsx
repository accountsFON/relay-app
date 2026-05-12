import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InFlightChoiceModal } from '@/components/relay/in-flight-choice-modal'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: vi.fn(),
}))
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

vi.mock('@/server/actions/finalize-post-generation', () => ({
  finalizePostGenerationAction: vi.fn(),
}))
import { finalizePostGenerationAction } from '@/server/actions/finalize-post-generation'

function mkAwaiting(id: string, clientName: string, startedAt: string): InFlightRun {
  return {
    id,
    clientId: 'c1',
    clientName,
    targetMonth: '2026-06',
    intent: 'awaiting_choice',
    status: 'complete',
    brief: true,
    crawledContent: true,
    supportingFacts: true,
    postCount: 0,
    errorMessage: null,
    startedAt,
    matchingBatch: { batchId: 'b1', label: 'June 2026', postCount: 5 },
  }
}

describe('InFlightChoiceModal', () => {
  const refresh = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(finalizePostGenerationAction).mockResolvedValue({ batchId: 'b1' })
  })

  it('renders nothing when no awaiting_choice runs exist', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [],
      isLoading: false,
      error: null,
      refresh,
    })
    const { container } = render(<InFlightChoiceModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when matchingBatch is missing (no decision needed)', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        {
          ...mkAwaiting('r1', 'Cedar', '2026-05-12T15:00:00Z'),
          matchingBatch: undefined,
        },
      ],
      isLoading: false,
      error: null,
      refresh,
    })
    const { container } = render(<InFlightChoiceModal />)
    expect(container.firstChild).toBeNull()
  })

  it('opens for the oldest awaiting_choice run', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkAwaiting('newer', 'Newer client', '2026-05-12T15:00:00Z'),
        mkAwaiting('older', 'Older client', '2026-05-12T14:00:00Z'),
      ],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightChoiceModal />)
    expect(screen.getByText(/older client/i)).toBeInTheDocument()
  })

  it('calls finalizePostGenerationAction with the correct choice on Add', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkAwaiting('r1', 'Cedar Creek', '2026-05-12T15:00:00Z')],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightChoiceModal />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Add to existing batch/i }))

    await waitFor(() => {
      expect(finalizePostGenerationAction).toHaveBeenCalledWith({
        choice: 'add',
        runId: 'r1',
        batchId: 'b1',
      })
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('calls finalizePostGenerationAction with a label on New', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkAwaiting('r1', 'Cedar Creek', '2026-05-12T15:00:00Z')],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightChoiceModal />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Start a new batch/i }))

    await waitFor(() => {
      expect(finalizePostGenerationAction).toHaveBeenCalledWith(
        expect.objectContaining({
          choice: 'new',
          runId: 'r1',
          label: expect.any(String),
        }),
      )
    })
  })

  it('calls finalizePostGenerationAction with the correct args on Replace', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkAwaiting('r1', 'Cedar Creek', '2026-05-12T15:00:00Z')],
      isLoading: false,
      error: null,
      refresh,
    })
    render(<InFlightChoiceModal />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Replace existing batch/i }))

    await waitFor(() => {
      expect(finalizePostGenerationAction).toHaveBeenCalledWith({
        choice: 'replace',
        runId: 'r1',
        batchId: 'b1',
      })
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('does not auto-reopen for a run dismissed via Escape', async () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkAwaiting('r1', 'Cedar Creek', '2026-05-12T15:00:00Z')],
      isLoading: false,
      error: null,
      refresh,
    })
    const { rerender } = render(<InFlightChoiceModal />)
    expect(screen.getByText(/cedar creek/i)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText(/cedar creek/i)).not.toBeInTheDocument())

    // Provider rerenders with the same run still present in awaiting_choice.
    // Modal must NOT reopen because it's session-dismissed.
    rerender(<InFlightChoiceModal />)
    expect(screen.queryByText(/cedar creek/i)).not.toBeInTheDocument()
  })
})
