import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const requireOrgContextMock = vi.fn()
vi.mock('@/server/middleware/auth', () => ({
  requireOrgContext: () => requireOrgContextMock(),
}))

const getSelfDeactivationBlockMock = vi.fn()
vi.mock('@/server/services/users', () => ({
  getSelfDeactivationBlock: (i: unknown) => getSelfDeactivationBlockMock(i),
}))

const countUserOwnedRecordsMock = vi.fn()
const findUserByClerkIdMock = vi.fn()
vi.mock('@/server/repositories/users', () => ({
  countUserOwnedRecords: (...a: unknown[]) => countUserOwnedRecordsMock(...a),
  findUserByClerkId: (...a: unknown[]) => findUserByClerkIdMock(...a),
}))

// Render the panel as a stub so we can assert the props the page computes.
vi.mock('@/components/settings/close-account-panel', () => ({
  CloseAccountPanel: (props: Record<string, unknown>) => (
    <div
      data-testid="panel"
      data-blocked={String(props.blocked)}
      data-email={String(props.userEmail)}
      data-reason={String(props.blockReason)}
      data-inventory={String(props.inventoryText)}
    />
  ),
}))

import AccountSettingsPage from '@/app/(app)/settings/account/page'

beforeEach(() => {
  vi.clearAllMocks()
  requireOrgContextMock.mockResolvedValue({
    userId: 'clerk_1',
    userDbId: 'u_self',
    organizationDbId: 'org_1',
    platformOwner: false,
  })
  findUserByClerkIdMock.mockResolvedValue({ email: 'me@example.com' })
  countUserOwnedRecordsMock.mockResolvedValue({
    heldBatches: 2,
    assignedAmClients: 0,
    assignedDesignerClients: 0,
    triggeredRuns: 0,
    createdMagicLinks: 0,
  })
  getSelfDeactivationBlockMock.mockResolvedValue({
    blocked: false,
    reason: null,
  })
})

describe('AccountSettingsPage', () => {
  it('passes guard + email + inventory text to the panel', async () => {
    const ui = await AccountSettingsPage()
    render(ui)
    const panel = screen.getByTestId('panel')
    expect(panel).toHaveAttribute('data-email', 'me@example.com')
    expect(panel).toHaveAttribute('data-blocked', 'false')
    expect(panel.getAttribute('data-inventory')).toMatch(/2 batches/i)
  })

  it('passes the block reason through when blocked', async () => {
    getSelfDeactivationBlockMock.mockResolvedValueOnce({
      blocked: true,
      reason: 'You are the last admin of Solo Agency.',
    })
    const ui = await AccountSettingsPage()
    render(ui)
    expect(screen.getByTestId('panel')).toHaveAttribute(
      'data-blocked',
      'true',
    )
  })
})
