import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep, RelayRole } from '@prisma/client'
import { RelayTrack } from '@/components/relay/relay-track'
import type { BatchSummary } from '@/components/relay/types'

// jsdom doesn't implement scrollIntoView; the ScrollCurrentIntoView client
// component calls it on mount. Stub it out so we can assert on render output.
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
}

function makeBatchSummary(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    id: 'batch-1',
    clientId: 'client-1',
    label: 'May 2026',
    currentStep: RelayStep.am_qa_pre_client,
    currentSubState: null,
    currentRole: RelayRole.am,
    scheduledAt: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    clientReviewEnabled: true,
    autoAdvanceOnTimeout: true,
    holder: { id: 'u1', name: 'Morgan' },
    daysOnCurrentStep: 0,
    ...overrides,
  }
}

describe('RelayTrack', () => {
  it('renders 9 nodes when the batch has clientReviewEnabled = true', () => {
    // 9 live steps after the 2026-06-22 rework (client_review + scheduling
    // replaced the retired sent_to_client/client_decision/ready_to_schedule/
    // revisions_complete/final_qa_schedule).
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // One horizontal swipe track on every viewport (no separate mobile stack).
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(9)
  })

  it('renders 7 nodes when clientReviewEnabled = false', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={batch} />)
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(7)
  })

  it('does not blank the track when the batch reaches client_review (the bug)', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // client_review is index 6 (7th node) of 9; pre-fix indexOf was -1 -> "Step 0 of 9".
    expect(screen.getByText(/Step\s+7\s+of\s+9/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(9)
  })

  it('renders the step counter as "Step X of Y" using the right total for the flow', () => {
    const reviewOff = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 5 in NO_REVIEW_TRACK
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={reviewOff} />)
    // am_qa_pre_client is the 6th node (index 5) in NO_REVIEW_TRACK; total is 7.
    expect(screen.getByText(/Step\s+6\s+of\s+7/i)).toBeInTheDocument()
  })

  it('renders the step counter using the FULL_TRACK total when review is on', () => {
    const reviewOn = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 5 in FULL_TRACK
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={reviewOn} />)
    // am_qa_pre_client is the 6th node (index 5) in FULL_TRACK; total is 9.
    expect(screen.getByText(/Step\s+6\s+of\s+9/i)).toBeInTheDocument()
  })

  it('still renders the 3-node client abstraction when audience = "client"', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} audience="client" />)
    // CLIENT_TRACK_VIEW has 3 nodes; one track on every viewport.
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(3)
  })

  it('shows "Pre-Client QA" in the header when QA step and clientReviewEnabled = true', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // The header h2 should say "Pre-Client QA" (review batch).
    expect(screen.getByRole('heading', { level: 2, name: /pre-client qa/i })).toBeInTheDocument()
  })

  it('shows "Final QA" in the header when QA step and clientReviewEnabled = false', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={batch} />)
    // The header h2 should say "Final QA" (no-review batch).
    expect(screen.getByRole('heading', { level: 2, name: /final qa/i })).toBeInTheDocument()
  })
})
