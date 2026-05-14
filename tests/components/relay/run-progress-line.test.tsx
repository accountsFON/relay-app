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
})
