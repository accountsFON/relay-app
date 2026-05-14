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

  it('renders persistent "Posts ready" with check when postCount > 0', () => {
    render(
      <RunProgressLine
        run={mkRun({
          brief: true,
          crawledContent: true,
          supportingFacts: true,
          postCount: 13,
        })}
      />,
    )
    expect(screen.getByText('Posts ready')).toBeInTheDocument()
  })

  it('renders persistent "Posts ready" for awaiting_choice intent', () => {
    render(
      <RunProgressLine
        run={mkRun({
          intent: 'awaiting_choice',
          brief: true,
          crawledContent: true,
          supportingFacts: true,
          postCount: 13,
        })}
      />,
    )
    expect(screen.getByText('Posts ready')).toBeInTheDocument()
    // Should NOT show the legacy decision prompt copy
    expect(screen.queryByText(/decide where posts go/i)).not.toBeInTheDocument()
  })

  it('renders XCircle + full error message when intent is failed', () => {
    const errorMessage =
      "Invalid prisma.post.createMany() invocation: column 'approvalStatus' does not exist"
    render(<RunProgressLine run={mkRun({ intent: 'failed', errorMessage })} />)
    // Match against the live text content directly so quotes and punctuation
    // don't trip up the regex matcher.
    expect(screen.getByText(`Failed: ${errorMessage}`)).toBeInTheDocument()
  })

  it('falls back to "unknown error" when errorMessage is null on a failed run', () => {
    render(<RunProgressLine run={mkRun({ intent: 'failed', errorMessage: null })} />)
    expect(screen.getByText(/Failed: unknown error/i)).toBeInTheDocument()
  })
})
