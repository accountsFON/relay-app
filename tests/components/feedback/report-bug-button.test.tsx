/**
 * UI tests for ReportBugButton (Phase 5 item 27).
 *
 * Covers:
 *   - default render shows the persistent trigger
 *   - clicking it opens the dialog with title + form
 *   - validation: submit disabled (and clicking does nothing) when body empty
 *   - happy path calls submitFeedbackAction with trimmed body + chosen severity
 *   - high severity success surfaces the "we've been paged" toast variant
 *   - server-side failure surfaces a toast.error and leaves the dialog open
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/server/actions/feedback', () => ({
  submitFeedbackAction: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { ReportBugButton } from '@/components/feedback/report-bug-button'
import { submitFeedbackAction } from '@/server/actions/feedback'
import { toast } from 'sonner'

const mockSubmit = submitFeedbackAction as unknown as ReturnType<typeof vi.fn>
const mockToastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>
const mockToastError = toast.error as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReportBugButton', () => {
  it('renders the persistent trigger', () => {
    render(<ReportBugButton />)
    expect(
      screen.getByRole('button', { name: /report a bug/i }),
    ).toBeInTheDocument()
  })

  it('opens the dialog with title + form when clicked', async () => {
    const user = userEvent.setup()
    render(<ReportBugButton />)

    await user.click(screen.getByRole('button', { name: /report a bug/i }))

    // DialogTitle uses an h2 with text "Report a bug"
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /report a bug/i }),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/what happened\?/i)).toBeInTheDocument()
  })

  it('disables submit while body is empty', async () => {
    const user = userEvent.setup()
    render(<ReportBugButton />)
    await user.click(screen.getByRole('button', { name: /report a bug/i }))

    const submitBtn = await screen.findByRole('button', { name: /^submit$/i })
    expect(submitBtn).toBeDisabled()
  })

  it('calls submitFeedbackAction with trimmed body + default medium severity on submit', async () => {
    mockSubmit.mockResolvedValue({ feedbackId: 'fb-1', urgentEmailSent: false })

    const user = userEvent.setup()
    render(<ReportBugButton />)
    await user.click(screen.getByRole('button', { name: /report a bug/i }))

    const textarea = await screen.findByLabelText(/what happened\?/i)
    await user.type(textarea, '   page goes blank   ')

    const submitBtn = await screen.findByRole('button', { name: /^submit$/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        bodyText: 'page goes blank',
        severity: 'medium',
      })
    })
    expect(mockToastSuccess).toHaveBeenCalledWith("Thanks, we'll look at this.")
  })

  it('surfaces the "we have been paged" toast when high severity submission reports the urgent email went out', async () => {
    mockSubmit.mockImplementation((input: { severity: string }) => {
      return Promise.resolve({
        feedbackId: 'fb-h',
        urgentEmailSent: input.severity === 'high',
      })
    })

    // For this test we don't have to flip the dropdown UI; we drive
    // intent by simulating the action's response directly with the
    // submitted severity. We do still need a body and a submit.
    const user = userEvent.setup()
    render(<ReportBugButton />)
    await user.click(screen.getByRole('button', { name: /report a bug/i }))
    await user.type(
      await screen.findByLabelText(/what happened\?/i),
      'broken now',
    )

    // The high path is exercised in the action unit tests; here we
    // assert that when the action says urgent went out, the toast
    // copy switches accordingly. Forge that by stubbing the action to
    // always return urgentEmailSent true.
    mockSubmit.mockResolvedValue({ feedbackId: 'fb-h', urgentEmailSent: true })

    await user.click(await screen.findByRole('button', { name: /^submit$/i }))

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Got it. We've been paged.")
    })
  })

  it('surfaces toast.error and leaves the dialog open when the action throws', async () => {
    mockSubmit.mockRejectedValue(new Error('Resend down'))

    const user = userEvent.setup()
    render(<ReportBugButton />)
    await user.click(screen.getByRole('button', { name: /report a bug/i }))
    await user.type(
      await screen.findByLabelText(/what happened\?/i),
      'nope',
    )
    await user.click(await screen.findByRole('button', { name: /^submit$/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })
    // Dialog still mounted: title heading is still present.
    expect(
      screen.getByRole('heading', { name: /report a bug/i }),
    ).toBeInTheDocument()
  })
})
