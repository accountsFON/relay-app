/**
 * UI tests for AdminForceStepSection (admin-only force-step control).
 *
 * Covers:
 *   - canForceStep=false renders nothing
 *   - canForceStep=true renders the collapsed "Admin tools" toggle (body hidden)
 *   - expanding shows the step dropdown + optional reason textarea
 *   - dropdown offers the live steps (incl. client_review + scheduling), excludes current step + every retired step
 *   - "Force step" disabled until a step is chosen
 *   - confirming opens the confirm dialog with from/to copy
 *   - confirm calls forceStepAction with batchId + toStep + trimmed reason
 *   - action failure surfaces toast.error and keeps the section open
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RelayStep } from '@prisma/client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockForceStepAction = vi.fn()
vi.mock('@/server/actions/relay', () => ({
  forceStepAction: (input: unknown) => mockForceStepAction(input),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AdminForceStepSection } from '@/components/relay/admin-force-step-section'

const baseProps = {
  batchId: 'batch-1',
  currentStep: RelayStep.am_review_design,
}

beforeEach(() => {
  mockForceStepAction.mockReset()
})

describe('AdminForceStepSection', () => {
  it('renders nothing when canForceStep is false', () => {
    const { container } = render(
      <AdminForceStepSection {...baseProps} canForceStep={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a collapsed "Admin tools" toggle when canForceStep is true', () => {
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    expect(
      screen.getByRole('button', { name: /admin tools/i }),
    ).toBeInTheDocument()
    // Collapsed: the step dropdown is not rendered yet.
    expect(
      screen.queryByRole('combobox', { name: /move this relay to/i }),
    ).not.toBeInTheDocument()
  })

  it('expands the body to reveal the step dropdown and reason textarea', async () => {
    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))

    expect(
      await screen.findByRole('combobox', { name: /move this relay to/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/reason.*optional/i),
    ).toBeInTheDocument()
  })

  it('offers the live steps (incl. client_review + scheduling), excludes the current step and every retired step', async () => {
    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))

    const select = (await screen.findByRole('combobox', {
      name: /move this relay to/i,
    })) as HTMLSelectElement
    const values = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v !== '') // drop the "Select step…" placeholder

    // Live steps offered (the two 2026-06-22 additions were previously missing).
    expect(values).toContain(RelayStep.copy)
    expect(values).toContain(RelayStep.in_design)
    expect(values).toContain(RelayStep.client_review)
    expect(values).toContain(RelayStep.implementing_revisions)
    expect(values).toContain(RelayStep.scheduling)
    expect(values).toContain(RelayStep.completed)

    // Current step is never offered.
    expect(values).not.toContain(RelayStep.am_review_design)

    // No retired step is offered (these used to litter the dropdown).
    for (const retired of [
      RelayStep.onboarding_gate,
      RelayStep.designs_completed,
      RelayStep.design_revisions,
      RelayStep.am_qa_pre_client,
      RelayStep.sent_to_client,
      RelayStep.client_decision,
      RelayStep.ready_to_schedule,
      RelayStep.revisions_complete,
      RelayStep.final_qa_schedule,
    ]) {
      expect(values, `retired ${retired} must not be offered`).not.toContain(retired)
    }
  })

  it('disables "Force step" until a step is selected', async () => {
    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))

    const forceBtn = await screen.findByRole('button', { name: /force step/i })
    expect(forceBtn).toBeDisabled()

    const select = await screen.findByRole('combobox', {
      name: /move this relay to/i,
    })
    await user.selectOptions(select, RelayStep.copy)

    expect(forceBtn).toBeEnabled()
  })

  it('opens a confirm dialog describing the from/to move', async () => {
    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /move this relay to/i }),
      RelayStep.copy,
    )
    await user.click(await screen.findByRole('button', { name: /force step/i }))

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(dialog.textContent).toContain(
        'Force this relay from Design Review to Copy Review',
      )
    })
  })

  it('calls forceStepAction with batchId, toStep, and trimmed reason on confirm', async () => {
    mockForceStepAction.mockResolvedValueOnce(undefined)

    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /move this relay to/i }),
      RelayStep.copy,
    )
    await user.type(
      screen.getByPlaceholderText(/reason.*optional/i),
      'reset to redo brief',
    )
    await user.click(await screen.findByRole('button', { name: /force step/i }))

    // Confirm in the dialog.
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(mockForceStepAction).toHaveBeenCalledWith({
        batchId: 'batch-1',
        toStep: 'copy',
        reason: 'reset to redo brief',
      })
    })
  })

  it('surfaces toast.error and stays open when the action rejects', async () => {
    mockForceStepAction.mockRejectedValueOnce(new Error('Relay not found'))
    const { toast } = await import('sonner')

    const user = userEvent.setup()
    render(<AdminForceStepSection {...baseProps} canForceStep />)

    await user.click(screen.getByRole('button', { name: /admin tools/i }))
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /move this relay to/i }),
      RelayStep.copy,
    )
    await user.click(await screen.findByRole('button', { name: /force step/i }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    // Section stays open: the combobox is still in the document.
    expect(
      screen.getByRole('combobox', { name: /move this relay to/i }),
    ).toBeInTheDocument()
  })
})
