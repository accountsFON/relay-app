// @vitest-environment jsdom
/**
 * UI tests for CopyOnboardingGate (copy-step onboarding gate for AMs + admins).
 *
 * Behaviors covered:
 *   - Enter workspace stays disabled until the client profile is opened.
 *   - Opening the profile modal marks the single review item done and enables
 *     Enter workspace, which fires the ack action with the batchId.
 *
 * Note on conventions: this repo's Dialog is @base-ui/react (not Radix), driven
 * with @testing-library/user-event exactly like designer-onboarding-gate.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Client } from '@prisma/client'
import { CopyOnboardingGate } from '@/components/relay/copy-onboarding-gate'

const ackMock = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/server/actions/copyGateAck', () => ({
  acknowledgeCopyGateAction: (...args: unknown[]) => ackMock(...args),
}))
vi.mock('@/components/clients/client-profile-view', () => ({
  ClientProfileView: () => <div data-testid="profile-view" />,
}))

// Only the fields the gate touches; cast through unknown to satisfy Client.
const client = {
  id: 'client_1',
  name: 'Acme Co',
} as unknown as Client

beforeEach(() => vi.clearAllMocks())

describe('CopyOnboardingGate', () => {
  it('keeps Enter workspace disabled until the client profile is opened', () => {
    render(<CopyOnboardingGate client={client} batchId="batch_1" />)
    expect(
      screen.getByRole('button', { name: /enter workspace/i }),
    ).toBeDisabled()
  })

  it('enables Enter workspace after the profile opens and calls the action', async () => {
    const user = userEvent.setup()
    render(<CopyOnboardingGate client={client} batchId="batch_1" />)

    await user.click(
      screen.getByRole('button', { name: /review client profile/i }),
    )
    expect(await screen.findByTestId('profile-view')).toBeInTheDocument()

    // Close the modal (base-ui aria-hides the background while it's open) so we
    // can assert against the underlying card. profileSeen must persist on close.
    await user.keyboard('{Escape}')

    const enter = screen.getByRole('button', { name: /enter workspace/i })
    expect(enter).toBeEnabled()

    await user.click(enter)
    expect(ackMock).toHaveBeenCalledWith('batch_1')
  })
})
