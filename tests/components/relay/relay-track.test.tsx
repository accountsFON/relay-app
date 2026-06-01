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
    holder: { id: 'u1', name: 'Morgan' },
    daysOnCurrentStep: 0,
    ...overrides,
  }
}

describe('RelayTrack', () => {
  it('renders 12 nodes when the batch has clientReviewEnabled = true', () => {
    // Was 13 before Phase 3 item 15 PR1 retired `designs_completed`.
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} />)
    // Desktop + mobile both render the node list, so we get 12 * 2 = 24.
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(12 * 2)
  })

  it('renders 8 nodes when clientReviewEnabled = false', () => {
    // Was 9 before Phase 3 item 15 PR1 retired `designs_completed`.
    const batch = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client,
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={batch} />)
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(8 * 2)
  })

  it('renders the step counter as "Step X of Y" using the right total for the flow', () => {
    const reviewOff = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 5 in NO_REVIEW_TRACK
      clientReviewEnabled: false,
    })
    render(<RelayTrack batch={reviewOff} />)
    // am_qa_pre_client is the 6th node (index 5) in NO_REVIEW_TRACK; total is 8.
    expect(screen.getByText(/Step\s+6\s+of\s+8/i)).toBeInTheDocument()
  })

  it('renders the step counter using the FULL_TRACK total when review is on', () => {
    const reviewOn = makeBatchSummary({
      currentStep: RelayStep.am_qa_pre_client, // index 5 in FULL_TRACK
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={reviewOn} />)
    // am_qa_pre_client is the 6th node (index 5) in FULL_TRACK; total is 12.
    expect(screen.getByText(/Step\s+6\s+of\s+12/i)).toBeInTheDocument()
  })

  it('still renders the 3-node client abstraction when audience = "client"', () => {
    const batch = makeBatchSummary({
      currentStep: RelayStep.sent_to_client,
      clientReviewEnabled: true,
    })
    render(<RelayTrack batch={batch} audience="client" />)
    // CLIENT_TRACK_VIEW has 3 nodes; rendered in both desktop + mobile = 6.
    expect(screen.getAllByTestId('relay-track-node')).toHaveLength(3 * 2)
  })
})
