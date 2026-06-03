import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/app/(app)/settings/account/actions', () => ({
  closeMyAccountAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const signOutMock = vi.fn()
vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: signOutMock }),
}))

import { CloseAccountPanel } from '@/components/settings/close-account-panel'
import { closeMyAccountAction } from '@/app/(app)/settings/account/actions'
import { toast } from 'sonner'

const mockAction = closeMyAccountAction as unknown as ReturnType<typeof vi.fn>
const mockToastError = toast.error as unknown as ReturnType<typeof vi.fn>

const baseProps = {
  userEmail: 'me@example.com',
  blocked: false,
  blockReason: null as string | null,
  inventoryText: 'You are holding 2 batches.',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CloseAccountPanel', () => {
  it('disables the final button until the typed email matches, then closes + signs out', async () => {
    mockAction.mockResolvedValueOnce({ userId: 'u', deactivated: true })
    const user = userEvent.setup()
    render(<CloseAccountPanel {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /delete my account/i }))

    const confirmBtn = screen.getByRole('button', { name: /^close account$/i })
    expect(confirmBtn).toBeDisabled()

    await user.type(
      screen.getByLabelText(/type your email to confirm/i),
      'me@example.com',
    )
    expect(confirmBtn).toBeEnabled()

    await user.click(confirmBtn)

    await waitFor(() => expect(mockAction).toHaveBeenCalledOnce())
    expect(signOutMock).toHaveBeenCalledWith({ redirectUrl: '/sign-in' })
  })

  it('renders the reason and disables the trigger when blocked', () => {
    render(
      <CloseAccountPanel
        {...baseProps}
        blocked
        blockReason="You are the last admin of Solo Agency."
      />,
    )
    expect(
      screen.getByText(/last admin of solo agency/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /delete my account/i }),
    ).toBeDisabled()
  })

  it('shows a toast and does not sign out when the action throws', async () => {
    mockAction.mockRejectedValueOnce(new Error('You are the last admin.'))
    const user = userEvent.setup()
    render(<CloseAccountPanel {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /delete my account/i }))
    await user.type(
      screen.getByLabelText(/type your email to confirm/i),
      'me@example.com',
    )
    await user.click(screen.getByRole('button', { name: /^close account$/i }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(signOutMock).not.toHaveBeenCalled()
  })
})
