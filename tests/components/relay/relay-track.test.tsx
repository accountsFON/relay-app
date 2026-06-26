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
  it('renders 8 nodes when the batch has clientReviewEnabled = true', () => {
    // 8 live steps after merge design steps (2026-06-26) dropped design_revisions
    // from the post-2026-06-22-rework track.
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // One horizontal swipe track on every viewport (no separate mobile stack).
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(8)
  })

  it('renders 6 nodes when clientReviewEnabled = false', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={batch} />)
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(6)
  })

  it('does not blank the track when the batch reaches client_review (the bug)', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.client_review,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // client_review is index 5 (6th node) of 8 after design_revisions is dropped.
    expect(screen.getByText(/Step\s+6\s+of\s+8/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(8)
  })

  it('renders the step counter as "Step X of Y" using the right total for the flow', () => {
    const reviewOff = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 4 in NO_REVIEW_TRACK
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={reviewOff} />)
    // am_qa_pre_client is the 5th node (index 4) in NO_REVIEW_TRACK; total is 6.
    expect(screen.getByText(/Step\s+5\s+of\s+6/i)).toBeInTheDocument()
  })

  it('renders the step counter using the FULL_TRACK total when review is on', () => {
    const reviewOn = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 4 in FULL_TRACK
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={reviewOn} />)
    // am_qa_pre_client is the 5th node (index 4) in FULL_TRACK; total is 8.
    expect(screen.getByText(/Step\s+5\s+of\s+8/i)).toBeInTheDocument()
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
