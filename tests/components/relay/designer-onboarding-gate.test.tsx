// @vitest-environment jsdom
/**
 * UI tests for DesignerOnboardingGate (P0 designer onboarding gate).
 *
 * Behaviors covered:
 *   - Enter workspace stays disabled until BOTH review items are opened.
 *   - Opening the profile modal marks the profile row done.
 *   - Brand guide link falls back to the agency Canva folder when the client
 *     has no per-client canvaUrl.
 *   - Brand guide link uses the client's own canvaUrl when present.
 *   - After both items open, Enter workspace enables and fires the ack action
 *     with the batchId.
 *
 * Note on conventions: this repo's Dialog is @base-ui/react (not Radix), so we
 * drive it with @testing-library/user-event exactly like the sibling
 * report-bug-button.test.tsx. In the combined flow we close the modal (Escape)
 * before clicking the brand-guide link so the base-ui modal backdrop/inert
 * layer doesn't intercept the pointer on the underlying card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Client } from '@prisma/client'
import { DesignerOnboardingGate } from '@/components/relay/designer-onboarding-gate'

const ackMock = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/server/actions/designerGateAck', () => ({
  acknowledgeDesignerGateAction: (...args: unknown[]) => ackMock(...args),
}))
vi.mock('@/components/clients/client-profile-view', () => ({
  ClientProfileView: () => <div data-testid="profile-view" />,
}))

// Only the fields the gate touches; cast through unknown to satisfy Client.
const client = {
  id: 'client_1',
  name: 'Acme Co',
  canvaUrl: null,
} as unknown as Client

beforeEach(() => vi.clearAllMocks())

describe('DesignerOnboardingGate', () => {
  it('keeps Enter workspace disabled until both items are opened', () => {
    render(<DesignerOnboardingGate client={client} batchId="batch_1" />)
    expect(
      screen.getByRole('button', { name: /enter workspace/i }),
    ).toBeDisabled()
  })

  it('marks the profile item done when the profile modal is opened', async () => {
    const user = userEvent.setup()
    render(<DesignerOnboardingGate client={client} batchId="batch_1" />)

    await user.click(
      screen.getByRole('button', { name: /review client profile/i }),
    )
    expect(await screen.findByTestId('profile-view')).toBeInTheDocument()

    // Close the modal (base-ui aria-hides the background while it's open) so we
    // can assert against the underlying card. profileSeen must persist on close.
    await user.keyboard('{Escape}')

    // Brand guide not yet opened → Enter workspace still disabled even though
    // the profile row is now marked done.
    expect(
      screen.getByRole('button', { name: /enter workspace/i }),
    ).toBeDisabled()
  })

  it('uses the fallback Canva folder when the client has no canvaUrl', () => {
    render(<DesignerOnboardingGate client={client} batchId="batch_1" />)
    const link = screen.getByRole('link', { name: /brand guide/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.canva.com/folder/FAFx8YbetmY',
    )
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('uses the client canvaUrl when present', () => {
    render(
      <DesignerOnboardingGate
        client={{ ...client, canvaUrl: 'https://canva.com/design/abc' }}
        batchId="batch_1"
      />,
    )
    expect(
      screen.getByRole('link', { name: /brand guide/i }),
    ).toHaveAttribute('href', 'https://canva.com/design/abc')
  })

  it('enables Enter workspace after both items open and calls the action', async () => {
    const user = userEvent.setup()
    render(<DesignerOnboardingGate client={client} batchId="batch_1" />)

    // 1. Open the profile modal (marks the profile row done).
    await user.click(
      screen.getByRole('button', { name: /review client profile/i }),
    )
    await screen.findByTestId('profile-view')

    // Close the modal so the base-ui backdrop stops intercepting the card.
    await user.keyboard('{Escape}')

    // 2. Open the brand guide (marks the brand row done). Opening in a new tab
    // is a benign no-op under jsdom; we only care about the onClick side effect.
    await user.click(screen.getByRole('link', { name: /brand guide/i }))

    const enter = screen.getByRole('button', { name: /enter workspace/i })
    expect(enter).toBeEnabled()

    await user.click(enter)
    expect(ackMock).toHaveBeenCalledWith('batch_1')
  })
})
