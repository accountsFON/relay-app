import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { InFlightBanner } from '@/components/relay/in-flight-banner'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: vi.fn(),
}))
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'

vi.mock('@/server/actions/in-flight-runs', () => ({
  cancelGenerationAction: (...args: unknown[]) => cancelMock(...args),
}))
const cancelMock = vi.fn()

function mkRun(overrides: Partial<InFlightRun>): InFlightRun {
  return {
    id: 'r1',
    clientId: 'c1',
    clientName: 'Cedar Creek',
    targetMonth: '2026-06',
    intent: 'active',
    status: 'running',
    brief: true,
    crawledContent: false,
    supportingFacts: false,
    postCount: 0,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    targetBatchId: null,
    ...overrides,
  }
}

describe('InFlightBanner', () => {
  it('renders nothing when no runs match the clientId', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ clientId: 'other' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    const { container } = render(<InFlightBanner clientId="c1" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders rows for runs matching the clientId', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({ id: 'r1', clientId: 'c1', clientName: 'Cedar Creek', targetMonth: '2026-06' }),
        mkRun({ id: 'r2', clientId: 'c1', clientName: 'Cedar Creek', targetMonth: '2026-07' }),
        mkRun({ id: 'r3', clientId: 'other', clientName: 'Apex' }),
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightBanner clientId="c1" />)
    expect(screen.getAllByTestId('banner-row')).toHaveLength(2)
    expect(screen.queryByText('Apex')).not.toBeInTheDocument()
    expect(screen.getByText('June 2026')).toBeInTheDocument()
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('renders a RunProgressLine per matched run instead of static stepLabel text', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [
        mkRun({
          id: 'r1',
          clientId: 'c1',
          targetMonth: '2026-06',
          brief: true,
          crawledContent: false,
        }),
      ],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightBanner clientId="c1" />)
    // RunProgressLine derives this from brief=true, crawledContent=false
    expect(screen.getByText(/Crawling websites/i)).toBeInTheDocument()
  })

  it('shows a Cancel button for an active run', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'run-1', clientId: 'c1', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightBanner clientId="c1" />)
    expect(screen.getByRole('button', { name: /cancel generation/i })).toBeInTheDocument()
  })

  it('does not show a Cancel button for a non-active run', () => {
    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'run-1', clientId: 'c1', intent: 'awaiting_choice' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })
    render(<InFlightBanner clientId="c1" />)
    expect(screen.queryByRole('button', { name: /cancel generation/i })).not.toBeInTheDocument()
  })

  it('cancels an active run after confirmation', async () => {
    const refreshMock = vi.fn()
    cancelMock.mockResolvedValue({ ok: true, status: 'cancelled' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'run-1', clientId: 'c1', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: refreshMock,
    })

    render(<InFlightBanner clientId="c1" />)

    const cancelBtn = screen.getByRole('button', { name: /cancel generation/i })
    await act(async () => {
      fireEvent.click(cancelBtn)
    })

    expect(confirmSpy).toHaveBeenCalled()
    expect(cancelMock).toHaveBeenCalledWith('run-1')
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('does not cancel if the user dismisses the confirm', async () => {
    cancelMock.mockClear()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    vi.mocked(useInFlightRuns).mockReturnValue({
      runs: [mkRun({ id: 'run-1', clientId: 'c1', intent: 'active' })],
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    })

    render(<InFlightBanner clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /cancel generation/i }))
    expect(cancelMock).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
