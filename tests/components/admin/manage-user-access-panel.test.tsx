/**
 * UI tests for ManageUserAccessPanel (Task 8 of the remove-user feature).
 *
 * Covers:
 *   - canDeactivate=false renders nothing
 *   - active + canDeactivate: "Deactivate access" present; click opens a
 *     confirm dialog; confirm calls deactivateUserAction({ userId })
 *   - active + isSelf: Deactivate disabled with a visible reason
 *   - active + isLastPlatformOwner: Deactivate disabled with a visible reason
 *   - deactivated: "Reactivate access" present; click calls reactivateUserAction
 *   - deactivated + canHardDelete: inventory sentence rendered; permanently
 *     delete gated by reassign target + exact email; click calls
 *     hardDeleteUserAction({ userId, reassignToUserId })
 *   - deactivated + canHardDelete=false: no permanently delete section
 *   - action rejects: toast.error fired, panel still rendered
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/(app)/admin/users/actions', () => ({
  deactivateUserAction: vi.fn(),
  reactivateUserAction: vi.fn(),
  hardDeleteUserAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

import { ManageUserAccessPanel } from '@/components/admin/manage-user-access-panel'
import {
  deactivateUserAction,
  reactivateUserAction,
  hardDeleteUserAction,
} from '@/app/(app)/admin/users/actions'
import { toast } from 'sonner'

const mockDeactivate = deactivateUserAction as unknown as ReturnType<typeof vi.fn>
const mockReactivate = reactivateUserAction as unknown as ReturnType<typeof vi.fn>
const mockHardDelete = hardDeleteUserAction as unknown as ReturnType<typeof vi.fn>
const mockToastError = toast.error as unknown as ReturnType<typeof vi.fn>

const baseProps = {
  userId: 'user-1',
  userEmail: 'target@example.com',
  isDeactivated: false,
  canDeactivate: true,
  canHardDelete: false,
  isSelf: false,
  isLastPlatformOwner: false,
  ownedInventory: {
    heldBatches: 0,
    assignedAmClients: 0,
    assignedDesignerClients: 0,
    triggeredRuns: 0,
    createdMagicLinks: 0,
  },
  reassignCandidates: [
    { id: 'user-2', name: 'Bonnie Boss', email: 'bonnie@example.com' },
    { id: 'user-3', name: 'Carl Cover', email: 'carl@example.com' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ManageUserAccessPanel', () => {
  it('renders nothing when canDeactivate is false', () => {
    const { container } = render(
      <ManageUserAccessPanel {...baseProps} canDeactivate={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows "Deactivate access" and confirms via dialog (active + canDeactivate)', async () => {
    mockDeactivate.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<ManageUserAccessPanel {...baseProps} />)

    const trigger = screen.getByRole('button', { name: /deactivate access/i })
    expect(trigger).toBeInTheDocument()
    expect(trigger).toBeEnabled()

    await user.click(trigger)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(dialog.textContent).toContain('target@example.com')
    })

    await user.click(within(dialog).getByRole('button', { name: /^deactivate$/i }))

    await waitFor(() => {
      expect(mockDeactivate).toHaveBeenCalledWith({ userId: 'user-1' })
    })
  })

  it('disables Deactivate with a reason when isSelf', () => {
    render(<ManageUserAccessPanel {...baseProps} isSelf />)
    const trigger = screen.getByRole('button', { name: /deactivate access/i })
    expect(trigger).toBeDisabled()
    expect(
      screen.getByText(/cannot deactivate your own account/i),
    ).toBeInTheDocument()
  })

  it('disables Deactivate with a reason when isLastPlatformOwner', () => {
    render(<ManageUserAccessPanel {...baseProps} isLastPlatformOwner />)
    const trigger = screen.getByRole('button', { name: /deactivate access/i })
    expect(trigger).toBeDisabled()
    expect(
      screen.getByText(/cannot remove the last platform owner/i),
    ).toBeInTheDocument()
  })

  it('shows "Reactivate access" and calls reactivateUserAction (deactivated)', async () => {
    mockReactivate.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<ManageUserAccessPanel {...baseProps} isDeactivated />)

    const reactivate = screen.getByRole('button', { name: /reactivate access/i })
    expect(reactivate).toBeInTheDocument()

    await user.click(reactivate)

    await waitFor(() => {
      expect(mockReactivate).toHaveBeenCalledWith({ userId: 'user-1' })
    })
  })

  it('renders inventory + gates the permanently delete button (deactivated + canHardDelete)', async () => {
    mockHardDelete.mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(
      <ManageUserAccessPanel
        {...baseProps}
        isDeactivated
        canHardDelete
        ownedInventory={{
          heldBatches: 2,
          assignedAmClients: 3,
          assignedDesignerClients: 1,
          triggeredRuns: 4,
          createdMagicLinks: 1,
        }}
      />,
    )

    // Inventory sentence rendered (nonzero categories listed).
    expect(screen.getByText(/holds 2 batches/i)).toBeInTheDocument()

    const deleteBtn = screen.getByRole('button', {
      name: /permanently delete/i,
    })
    // Disabled initially: no reassign target + email not typed.
    expect(deleteBtn).toBeDisabled()

    // Select a reassign target only -> still disabled (email not typed).
    const reassign = screen.getByRole('combobox', { name: /reassign to/i })
    await user.selectOptions(reassign, 'user-2')
    expect(deleteBtn).toBeDisabled()

    // Type a wrong email -> still disabled.
    const confirmInput = screen.getByPlaceholderText(/type the email to confirm/i)
    await user.type(confirmInput, 'wrong@example.com')
    expect(deleteBtn).toBeDisabled()

    // Fix to the exact email -> now enabled.
    await user.clear(confirmInput)
    await user.type(confirmInput, 'target@example.com')
    expect(deleteBtn).toBeEnabled()

    await user.click(deleteBtn)

    await waitFor(() => {
      expect(mockHardDelete).toHaveBeenCalledWith({
        userId: 'user-1',
        reassignToUserId: 'user-2',
      })
    })
  })

  it('hides the permanently delete section when canHardDelete is false', () => {
    render(<ManageUserAccessPanel {...baseProps} isDeactivated canHardDelete={false} />)
    expect(screen.getByRole('button', { name: /reactivate access/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /permanently delete/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: /reassign to/i }),
    ).not.toBeInTheDocument()
  })

  it('surfaces toast.error and keeps the panel when an action rejects', async () => {
    mockReactivate.mockRejectedValueOnce(new Error('Service down'))
    const user = userEvent.setup()
    render(<ManageUserAccessPanel {...baseProps} isDeactivated />)

    await user.click(screen.getByRole('button', { name: /reactivate access/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })
    // Panel still rendered.
    expect(
      screen.getByRole('button', { name: /reactivate access/i }),
    ).toBeInTheDocument()
  })
})
