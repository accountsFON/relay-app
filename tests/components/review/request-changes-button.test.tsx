/**
 * UI tests for RequestChangesButton.
 *
 * Covers:
 *   - clicking "Request changes" opens the confirmation modal (onClick NOT fired yet)
 *   - modal body shows designer name / falls back to "the designer"
 *   - cancel button closes the modal without firing onClick
 *   - confirm fires onClick exactly once, then success copy appears
 *   - button is disabled after successful send (no double-fire)
 *   - error path: onClick rejects -> error element rendered, no success element
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestChangesButton } from '@/components/review/request-changes-button'

describe('RequestChangesButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Modal open / close behaviour ----

  it('opens the confirmation modal without firing onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    await user.click(screen.getByTestId('request-changes-button'))

    // Both action buttons must be visible after opening
    await screen.findByTestId('request-changes-confirm')
    expect(screen.getByTestId('request-changes-cancel')).toBeInTheDocument()
    // onClick must NOT have fired yet
    expect(onClick).not.toHaveBeenCalled()
  })

  it('widens the dialog past the default so the two long action buttons do not overflow', async () => {
    // The shared DialogContent defaults to sm:max-w-sm (384px); the two long
    // buttons ("No, go back and add notes" + "Yes, request changes") overflow
    // it. A responsive sm:max-w-* override widens it mobile-safely (matches the
    // #340/#341 gate-modal fix).
    const user = userEvent.setup()
    render(
      <RequestChangesButton onClick={vi.fn().mockResolvedValue(undefined)} designerName="Mollie Huebner" />,
    )
    await user.click(screen.getByTestId('request-changes-button'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveClass('sm:max-w-md')
  })

  it('shows designer name in modal body when designerName is passed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    await user.click(screen.getByTestId('request-changes-button'))

    await screen.findByTestId('request-changes-confirm')
    expect(
      screen.getByRole('heading', { name: /request changes\?/i }),
    ).toBeInTheDocument()
    // Body copy must include the designer's name
    expect(screen.getByText(/Mollie Huebner/)).toBeInTheDocument()
  })

  it('falls back to "the designer" in modal body when designerName is null', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<RequestChangesButton onClick={onClick} designerName={null} />)

    await user.click(screen.getByTestId('request-changes-button'))

    await screen.findByTestId('request-changes-confirm')
    expect(screen.getByText(/the designer/i)).toBeInTheDocument()
  })

  it('cancel button closes the modal without calling onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    await user.click(screen.getByTestId('request-changes-button'))
    await screen.findByTestId('request-changes-cancel')

    await user.click(screen.getByTestId('request-changes-cancel'))

    await waitFor(() => {
      expect(
        screen.queryByTestId('request-changes-confirm'),
      ).not.toBeInTheDocument()
    })
    expect(onClick).not.toHaveBeenCalled()
  })

  // ---- Confirm flow ----

  it('shows a success line naming the notified designer after confirm', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    await user.click(screen.getByTestId('request-changes-button'))
    await user.click(await screen.findByTestId('request-changes-confirm'))

    const success = await screen.findByTestId('request-changes-success')
    expect(success.textContent).toContain('Mollie Huebner')
    expect(success.textContent).toMatch(/notified/i)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('falls back when no designer is assigned after confirm', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<RequestChangesButton onClick={onClick} designerName={null} />)

    await user.click(screen.getByTestId('request-changes-button'))
    await user.click(await screen.findByTestId('request-changes-confirm'))

    const success = await screen.findByTestId('request-changes-success')
    expect(success.textContent).toMatch(/no designer is assigned/i)
  })

  it('disables the button after a successful send (no double-fire)', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    const button = screen.getByTestId(
      'request-changes-button',
    ) as HTMLButtonElement
    await user.click(button)
    await user.click(await screen.findByTestId('request-changes-confirm'))

    // Success rendered, and the button is now disabled so it can't be re-fired.
    await screen.findByTestId('request-changes-success')
    expect(button.disabled).toBe(true)

    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('surfaces an error and shows no success line when the action rejects', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockRejectedValueOnce(new Error('nope'))
    render(
      <RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />,
    )

    await user.click(screen.getByTestId('request-changes-button'))
    await user.click(await screen.findByTestId('request-changes-confirm'))

    expect(await screen.findByTestId('request-changes-error')).toBeInTheDocument()
    expect(
      screen.queryByTestId('request-changes-success'),
    ).not.toBeInTheDocument()
  })
})
