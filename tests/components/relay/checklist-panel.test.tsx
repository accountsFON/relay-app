import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelayStep, RelayRole } from '@prisma/client'
import { ChecklistPanel } from '@/components/relay/checklist-panel'
import type { BatchSummary, ChecklistItem } from '@/components/relay/types'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/relay', () => ({
  finishBatchAction: vi.fn(),
  passBatonAction: vi.fn(),
  sendBackBatonAction: vi.fn(),
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

  it('shows "Send to client review" when AM review with client review enabled', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ clientReviewEnabled: true })}
        items={makeItems()}
        canAct
        nextStep={RelayStep.am_qa_pre_client}
      />,
    )
    expect(
      screen.getByRole('button', { name: /send to client review/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /pass to pre-client qa/i }),
    ).not.toBeInTheDocument()
  })

  it('shows "Send to final QA" when AM review with client review disabled', () => {
    render(
      <ChecklistPanel
        batch={makeBatch({ clientReviewEnabled: false })}
        items={makeItems()}
        canAct
        nextStep={RelayStep.am_qa_pre_client}
      />,
    )
    expect(
      screen.getByRole('button', { name: /send to final qa/i }),
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
      screen.getByRole('button', { name: /pass to in design/i }),
    ).toBeInTheDocument()
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
