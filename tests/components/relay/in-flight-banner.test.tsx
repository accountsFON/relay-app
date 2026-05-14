import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InFlightBanner } from '@/components/relay/in-flight-banner'
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
})
