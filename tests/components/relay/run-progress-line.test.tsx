import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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

  describe('check-flash on phase transition', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('flashes "Brief written" when brief flips false → true', () => {
      const { rerender } = render(<RunProgressLine run={mkRun()} />)
      expect(screen.getByText(/Starting up/i)).toBeInTheDocument()

      rerender(<RunProgressLine run={mkRun({ brief: true })} />)
      expect(screen.getByText('Brief written')).toBeInTheDocument()
    })

    it('flashes "Crawled" when crawledContent flips false → true', () => {
      const { rerender } = render(<RunProgressLine run={mkRun({ brief: true })} />)
      rerender(<RunProgressLine run={mkRun({ brief: true, crawledContent: true })} />)
      expect(screen.getByText('Crawled')).toBeInTheDocument()
    })

    it('flashes "Facts extracted" when supportingFacts flips false → true', () => {
      const { rerender } = render(
        <RunProgressLine run={mkRun({ brief: true, crawledContent: true })} />,
      )
      rerender(
        <RunProgressLine
          run={mkRun({ brief: true, crawledContent: true, supportingFacts: true })}
        />,
      )
      expect(screen.getByText('Facts extracted')).toBeInTheDocument()
    })

    it('shows "Posts ready" when postCount goes 0 → >0', () => {
      const { rerender } = render(
        <RunProgressLine
          run={mkRun({ brief: true, crawledContent: true, supportingFacts: true, postCount: 0 })}
        />,
      )
      rerender(
        <RunProgressLine
          run={mkRun({ brief: true, crawledContent: true, supportingFacts: true, postCount: 13 })}
        />,
      )
      // Both the flash and the persistent terminal say "Posts ready"
      expect(screen.getByText('Posts ready')).toBeInTheDocument()
    })

    it('clears the flash after 300ms and advances to next active step', () => {
      const { rerender } = render(<RunProgressLine run={mkRun()} />)
      rerender(<RunProgressLine run={mkRun({ brief: true })} />)
      expect(screen.getByText('Brief written')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(screen.queryByText('Brief written')).not.toBeInTheDocument()
      expect(screen.getByText(/Crawling websites/i)).toBeInTheDocument()
    })

    it('latest-flip wins when two phases flip in a single rerender', () => {
      const { rerender } = render(<RunProgressLine run={mkRun()} />)
      rerender(<RunProgressLine run={mkRun({ brief: true, crawledContent: true })} />)
      // The component checks transitions in order brief → crawl → facts → posts,
      // and the latest wins. We expect "Crawled" since crawl is later in the chain.
      expect(screen.getByText('Crawled')).toBeInTheDocument()
    })
  })

  describe('safety: cleanup and abort', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not throw or warn when unmounted mid-flash', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { rerender, unmount } = render(<RunProgressLine run={mkRun()} />)
      rerender(<RunProgressLine run={mkRun({ brief: true })} />)
      expect(screen.getByText('Brief written')).toBeInTheDocument()

      unmount()

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('failed intent during a flash immediately wins over the check', () => {
      const { rerender } = render(<RunProgressLine run={mkRun()} />)
      rerender(<RunProgressLine run={mkRun({ brief: true })} />)
      expect(screen.getByText('Brief written')).toBeInTheDocument()

      // Mid-flash, the pipeline fails. Failed render must take precedence.
      rerender(
        <RunProgressLine
          run={mkRun({ brief: true, intent: 'failed', errorMessage: 'boom' })}
        />,
      )

      expect(screen.queryByText('Brief written')).not.toBeInTheDocument()
      expect(screen.getByText(/Failed: boom/i)).toBeInTheDocument()
    })
  })
})
