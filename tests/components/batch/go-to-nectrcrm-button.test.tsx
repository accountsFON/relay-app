/**
 * Item 37: chip on the batch detail action row that opens NectrCRM (the
 * white-labeled GoHighLevel app) in a new tab so the AM can upload the
 * exported Social Planner CSV. Visibility is gated to the `scheduling` step.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep } from '@prisma/client'
import { GoToNectrCrmButton } from '@/components/batch/go-to-nectrcrm-button'
import { NECTR_CRM_URL } from '@/lib/nectr'

describe('GoToNectrCrmButton', () => {
  it('renders at the scheduling step with a working external link', () => {
    render(<GoToNectrCrmButton currentStep={RelayStep.scheduling} />)
    const link = screen.getByRole('link', { name: /go to nectrcrm/i })
    expect(link).toHaveAttribute('href', NECTR_CRM_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Pre-rework in-flight batches still sit on the retired scheduling steps;
  // the chip must show there too.
  it('renders on the retired scheduling steps (ready_to_schedule, final_qa_schedule)', () => {
    for (const step of [RelayStep.ready_to_schedule, RelayStep.final_qa_schedule]) {
      const { unmount } = render(<GoToNectrCrmButton currentStep={step} />)
      expect(
        screen.getByRole('link', { name: /go to nectrcrm/i }),
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('does not render outside the scheduling stage', () => {
    const offSteps: RelayStep[] = [
      RelayStep.copy,
      RelayStep.in_design,
      RelayStep.am_qa_pre_client,
      RelayStep.client_review,
      RelayStep.completed,
    ]
    for (const step of offSteps) {
      const { unmount } = render(<GoToNectrCrmButton currentStep={step} />)
      expect(
        screen.queryByRole('link', { name: /go to nectrcrm/i }),
      ).not.toBeInTheDocument()
      unmount()
    }
  })
})
