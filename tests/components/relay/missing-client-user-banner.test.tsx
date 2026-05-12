import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelayStep } from '@prisma/client'
import { MissingClientUserBanner } from '@/components/relay/missing-client-user-banner'

const passBatonMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/server/actions/relay', () => ({
  passBatonAction: (input: { batchId: string; toStep: RelayStep }) =>
    passBatonMock(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

describe('MissingClientUserBanner', () => {
  beforeEach(() => {
    passBatonMock.mockReset()
    refreshMock.mockReset()
  })

  describe('at sent_to_client (UI step 8)', () => {
    it('renders the client name and the skip affordance', () => {
      render(
        <MissingClientUserBanner
          batchId="batch-1"
          clientName="Cedar Creek Dental"
          currentStep={RelayStep.sent_to_client}
        />,
      )
      expect(screen.getByText(/Cedar Creek Dental/)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /skip client review/i }),
      ).toBeInTheDocument()
    })

    it('calls passBatonAction with client_decision when Skip is clicked', async () => {
      passBatonMock.mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      render(
        <MissingClientUserBanner
          batchId="batch-1"
          clientName="Cedar Creek Dental"
          currentStep={RelayStep.sent_to_client}
        />,
      )
      await user.click(screen.getByRole('button', { name: /skip client review/i }))
      expect(passBatonMock).toHaveBeenCalledWith({
        batchId: 'batch-1',
        toStep: RelayStep.client_decision,
      })
      expect(refreshMock).toHaveBeenCalled()
    })

    it('surfaces the error message when passBatonAction throws', async () => {
      passBatonMock.mockRejectedValue(new Error('Illegal transition'))
      const user = userEvent.setup()
      render(
        <MissingClientUserBanner
          batchId="batch-1"
          clientName="Cedar Creek Dental"
          currentStep={RelayStep.sent_to_client}
        />,
      )
      await user.click(screen.getByRole('button', { name: /skip client review/i }))
      expect(await screen.findByText(/Illegal transition/)).toBeInTheDocument()
      expect(refreshMock).not.toHaveBeenCalled()
    })
  })

  describe('at client_decision (UI step 9)', () => {
    it('renders the approve-on-behalf affordance', () => {
      render(
        <MissingClientUserBanner
          batchId="batch-9"
          clientName="Apex Plumbing"
          currentStep={RelayStep.client_decision}
        />,
      )
      expect(screen.getByText(/Apex Plumbing/)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /approve on behalf of client/i }),
      ).toBeInTheDocument()
    })

    it('calls passBatonAction with ready_to_schedule when Approve is clicked', async () => {
      passBatonMock.mockResolvedValue({ ok: true })
      const user = userEvent.setup()
      render(
        <MissingClientUserBanner
          batchId="batch-9"
          clientName="Apex Plumbing"
          currentStep={RelayStep.client_decision}
        />,
      )
      await user.click(
        screen.getByRole('button', { name: /approve on behalf of client/i }),
      )
      expect(passBatonMock).toHaveBeenCalledWith({
        batchId: 'batch-9',
        toStep: RelayStep.ready_to_schedule,
      })
      expect(refreshMock).toHaveBeenCalled()
    })
  })
})
