import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RelayStep, RelayRole } from '@prisma/client'
import { ChecklistPanel } from '@/components/relay/checklist-panel'
import type { BatchSummary, ChecklistItem } from '@/components/relay/types'
import {
  passBatonAction,
  requestDesignChangesAction,
  tickChecklistItemAction,
} from '@/server/actions/relay'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

// The batch-page Send-to-Client-Review confirm flow (P1 #13) is unit-tested in
// send-to-client-review-button.test.tsx. Stub it here so the ChecklistPanel
// tests just assert it renders (with the right label) at am_review_design.
vi.mock('@/components/relay/send-to-client-review-button', () => ({
  SendToClientReviewButton: ({
    clientReviewEnabled,
  }: {
    clientReviewEnabled: boolean
  }) => (
    <button type="button">
      {clientReviewEnabled ? 'Send to Client Review' : 'Final QA'}
    </button>
  ),
}))

vi.mock('@/server/actions/relay', () => ({
  finishBatchAction: vi.fn(),
  passBatonAction: vi.fn(),
  sendBackBatonAction: vi.fn(),
  requestDesignChangesAction: vi.fn(),
  tickChecklistItemAction: vi.fn(),
  forceStepAction: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function makeBatch(overrides: Partial<BatchSummary> = {}): BatchSummary {
  return {
    id: 'batch-1',
    clientId: 'client-1',
    label: 'May 2026',
    currentStep: RelayStep.am_review_design,
    currentSubState: null,
    currentRole: RelayRole.am,
    scheduledAt: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    clientReviewEnabled: true,
    autoAdvanceOnTimeout: true,
    holder: { id: 'user-am', name: 'Mollie' },
    daysOnCurrentStep: 0,
    ...overrides,
  }
}

function makeItems(): ChecklistItem[] {
  return [
    {
      id: 'item-1',
      batchId: 'batch-1',
      step: RelayStep.am_review_design,
      label: 'Visual concept aligned with brief',
      required: true,
      checked: true,
      checkedBy: null,
      checkedAt: null,
    },
  ]
}

describe('ChecklistPanel CTA label (Phase 3 item 16)', () => {
  beforeEach(() => {
    refreshMock.mockReset()
  })

  it('shows "Send to Client Review" on Design Review with client review enabled (P1 #13)', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ clientReviewEnabled: true })}
        items={makeItems()}
        canAct
        nextStep={RelayStep.client_review}
      />,
    )
    expect(
      screen.getByRole('button', { name: /send to client review/i }),
    ).toBeInTheDocument()
  })

  it('shows "Final QA" on Design Review with client review disabled (P1 #13)', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ clientReviewEnabled: false })}
        items={makeItems()}
        canAct
        nextStep={RelayStep.scheduling}
      />,
    )
    expect(
      screen.getByRole('button', { name: /final qa/i }),
    ).toBeInTheDocument()
  })

  it('falls back to "Pass to ${stepLabel}" on non-AM-review steps', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.copy })}
        items={[
          {
            id: 'item-copy-1',
            batchId: 'batch-1',
            step: RelayStep.copy,
            label: 'Copy approved',
            required: true,
            checked: true,
            checkedBy: null,
            checkedAt: null,
          },
        ]}
        canAct
        nextStep={RelayStep.in_design}
      />,
    )
    expect(
      screen.getByRole('button', { name: /pass to initial design/i }),
    ).toBeInTheDocument()
  })
})

describe('ChecklistPanel step header label (Task 7 dynamic QA label)', () => {
  it('shows "Pre-Client QA" as the step header when QA step and clientReviewEnabled = true', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({
          currentStep: RelayStep.am_qa_pre_client,
          clientReviewEnabled: true,
        })}
        items={[]}
        canAct={false}
      />,
    )
    // The subtitle line reads "Pre-Client QA · held by …"
    expect(screen.getByText(/pre-client qa · held by/i)).toBeInTheDocument()
  })

  it('shows "Final QA" as the step header when QA step and clientReviewEnabled = false', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({
          currentStep: RelayStep.am_qa_pre_client,
          clientReviewEnabled: false,
        })}
        items={[]}
        canAct={false}
      />,
    )
    // The subtitle line reads "Final QA · held by …"
    expect(screen.getByText(/final qa · held by/i)).toBeInTheDocument()
  })
})

describe('ChecklistPanel tick does not block the Pass button', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    vi.mocked(tickChecklistItemAction).mockReset()
    vi.mocked(passBatonAction).mockReset()
    vi.mocked(tickChecklistItemAction).mockResolvedValue({ ok: true } as never)
    vi.mocked(passBatonAction).mockResolvedValue(undefined as never)
  })

  function copyItem(checked: boolean): ChecklistItem {
    return {
      id: 'item-copy-1',
      batchId: 'batch-1',
      step: RelayStep.copy,
      label: 'Copy approved',
      required: true,
      checked,
      checkedBy: null,
      checkedAt: null,
    }
  }

  it('keeps the Pass button enabled while the tick is still saving', async () => {
    // The tick action stays in flight so we can observe the button mid-save.
    let resolveTick!: () => void
    const pending = new Promise<void>((r) => {
      resolveTick = () => r()
    })
    vi.mocked(tickChecklistItemAction).mockReturnValue(pending as never)

    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.copy })}
        items={[copyItem(false)]}
        canAct
        nextStep={RelayStep.in_design}
      />,
    )

    expect(
      screen.getByRole('button', { name: /pass to initial design/i }),
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /check item/i }))

    // The last required item is checked optimistically; the save is still
    // in flight, but the Pass button must be clickable, not blocked by it.
    expect(
      screen.getByRole('button', { name: /pass to initial design/i }),
    ).toBeEnabled()

    resolveTick()
    await pending
  })

  it('does not trigger a full page refresh when an item is ticked', async () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.copy })}
        items={[copyItem(false)]}
        canAct
        nextStep={RelayStep.in_design}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /check item/i }))

    await waitFor(() =>
      expect(tickChecklistItemAction).toHaveBeenCalledWith({
        itemId: 'item-copy-1',
        checked: true,
      }),
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('still refreshes the page after passing the baton', async () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.copy })}
        items={[copyItem(true)]}
        canAct
        nextStep={RelayStep.in_design}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /pass to initial design/i }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(passBatonAction).toHaveBeenCalledWith({
      batchId: 'batch-1',
      toStep: RelayStep.in_design,
    })
  })
})

describe('ChecklistPanel multiple forward targets', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    vi.mocked(passBatonAction).mockReset()
    vi.mocked(passBatonAction).mockResolvedValue(undefined as never)
  })

  const twoTargets = [
    { step: RelayStep.sent_to_client, label: 'Send back to client for re-review' },
    { step: RelayStep.final_qa_schedule, label: 'Proceed to scheduling' },
  ]
  const revItem = (checked: boolean) => ({
    id: 'r1', batchId: 'batch-1', step: RelayStep.implementing_revisions,
    label: 'Revisions complete', required: true, checked,
    checkedBy: null, checkedAt: null,
  })

  it('renders one enabled button per forward target when required items are checked', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.implementing_revisions })}
        items={[revItem(true)]} canAct legalForwardTargets={twoTargets}
      />,
    )
    expect(screen.getByRole('button', { name: /send back to client for re-review/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /proceed to scheduling/i })).toBeEnabled()
  })

  it('passes to the chosen forward step', async () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.implementing_revisions })}
        items={[revItem(true)]} canAct legalForwardTargets={twoTargets}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /proceed to scheduling/i }))
    await waitFor(() => expect(passBatonAction).toHaveBeenCalledWith({
      batchId: 'batch-1', toStep: RelayStep.final_qa_schedule,
    }))
  })

  it('disables the forward buttons until required items are checked', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.implementing_revisions })}
        items={[revItem(false)]} canAct legalForwardTargets={twoTargets}
      />,
    )
    expect(screen.getByRole('button', { name: /proceed to scheduling/i })).toBeDisabled()
  })
})

describe('ChecklistPanel admin force-step gating (Task 8)', () => {
  it('shows the Admin tools section when canForceStep is true', () => {
    render(
      <ChecklistPanel
        batch={makeBatch()}
        items={[]}
        canAct={true}
        nextStep={RelayStep.am_qa_pre_client}
        canForceStep={true}
      />,
    )
    expect(
      screen.getByRole('button', { name: /admin tools/i }),
    ).toBeInTheDocument()
  })

  it('hides the Admin tools section when canForceStep is false', () => {
    render(
      <ChecklistPanel
        batch={makeBatch()}
        items={[]}
        canAct={true}
        nextStep={RelayStep.am_qa_pre_client}
        canForceStep={false}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /admin tools/i }),
    ).not.toBeInTheDocument()
  })
})

describe('ChecklistPanel Request changes (merge design steps)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a "Request changes" control on am_review_design and calls the action', async () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.am_review_design })}
        items={[]}
        canAct={true}
        nextStep={RelayStep.am_qa_pre_client}
      />,
    )
    const btn = screen.getByTestId('request-design-changes')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    await waitFor(() => {
      expect(requestDesignChangesAction).toHaveBeenCalledWith({ batchId: 'batch-1' })
    })
  })

  it('still renders the pass-to-QA forward button on am_review_design', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.am_review_design })}
        items={[]}
        canAct={true}
        nextStep={RelayStep.am_qa_pre_client}
      />,
    )
    // Approve / pass forward CTA is still present alongside Request changes.
    expect(screen.getByText(/send to client review|final qa|pass to/i)).toBeInTheDocument()
  })

  it('does NOT offer a send-back-to-Design-Revision option (empty send-back targets)', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.am_review_design })}
        items={[]}
        canAct={true}
        nextStep={RelayStep.am_qa_pre_client}
        legalSendBackTargets={[]}
      />,
    )
    expect(screen.queryByRole('button', { name: /send back/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/design revision/i)).not.toBeInTheDocument()
  })

  it('does NOT render "Request changes" on other steps', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ currentStep: RelayStep.am_qa_pre_client })}
        items={[]}
        canAct={true}
        nextStep={RelayStep.client_review}
      />,
    )
    expect(screen.queryByTestId('request-design-changes')).not.toBeInTheDocument()
  })
})
