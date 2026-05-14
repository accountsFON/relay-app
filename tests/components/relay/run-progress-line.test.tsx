import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunProgressLine } from '@/components/relay/run-progress-line'
import type { InFlightRun } from '@/server/actions/in-flight-runs'

function mkRun(overrides: Partial<InFlightRun> = {}): InFlightRun {
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

describe('RunProgressLine', () => {
  it('renders "Starting up..." when an active run has no phase flags set', () => {
    render(<RunProgressLine run={mkRun()} />)
    expect(screen.getByText(/Starting up/i)).toBeInTheDocument()
  })

  it('renders "Crawling websites..." when only brief is true', () => {
    render(<RunProgressLine run={mkRun({ brief: true })} />)
    expect(screen.getByText(/Crawling websites/i)).toBeInTheDocument()
  })

  it('renders "Extracting facts..." when brief + crawledContent are true', () => {
    render(<RunProgressLine run={mkRun({ brief: true, crawledContent: true })} />)
    expect(screen.getByText(/Extracting facts/i)).toBeInTheDocument()
  })

  it('renders "Writing captions..." when brief + crawl + facts are all true, postCount 0', () => {
    render(
      <RunProgressLine
        run={mkRun({ brief: true, crawledContent: true, supportingFacts: true, postCount: 0 })}
      />,
    )
    expect(screen.getByText(/Writing captions/i)).toBeInTheDocument()
  })

  it('advances honestly through phases when re-crawl is off (crawledContent never flips)', () => {
    // If client.autoCrawl === 'never', crawledContent stays false through the
    // whole pipeline. The line progresses based on whichever flag is the latest
    // to flip — supportingFacts being true wins over the still-false crawl flag.
    render(
      <RunProgressLine
        run={mkRun({ brief: true, crawledContent: false, supportingFacts: true })}
      />,
    )
    expect(screen.getByText(/Writing captions/i)).toBeInTheDocument()
  })
})
