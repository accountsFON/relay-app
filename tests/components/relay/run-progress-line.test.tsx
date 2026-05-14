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

  it('skips the crawl phase visually when crawledContent stays false (re-crawl off)', () => {
    // If client.autoCrawl === 'never', crawledContent never flips. supportingFacts
    // still flips when the pipeline reaches that step. We render facts honestly.
    render(
      <RunProgressLine
        run={mkRun({ brief: true, crawledContent: false, supportingFacts: true })}
      />,
    )
    expect(screen.getByText(/Extracting facts/i)).toBeInTheDocument()
    expect(screen.queryByText(/Crawling websites/i)).not.toBeInTheDocument()
  })
})
