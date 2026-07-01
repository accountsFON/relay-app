import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestChangesButton } from '@/components/review/request-changes-button'

describe('RequestChangesButton', () => {
  it('shows a success line naming the notified designer', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />)

    await user.click(screen.getByTestId('request-changes-button'))

    const success = await screen.findByTestId('request-changes-success')
    expect(success.textContent).toContain('Mollie Huebner')
    expect(success.textContent).toMatch(/notified/i)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('falls back when no designer is assigned', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<RequestChangesButton onClick={onClick} designerName={null} />)

    await user.click(screen.getByTestId('request-changes-button'))

    const success = await screen.findByTestId('request-changes-success')
    expect(success.textContent).toMatch(/no designer is assigned/i)
  })

  it('disables the button after a successful send (no double-fire)', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockResolvedValue(undefined)
    render(<RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />)

    const button = screen.getByTestId('request-changes-button') as HTMLButtonElement
    await user.click(button)

    // Success rendered, and the button is now disabled so it can't be re-fired.
    await screen.findByTestId('request-changes-success')
    expect(button.disabled).toBe(true)

    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('surfaces an error and shows no success line when the action rejects', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn().mockRejectedValueOnce(new Error('nope'))
    render(<RequestChangesButton onClick={onClick} designerName="Mollie Huebner" />)

    await user.click(screen.getByTestId('request-changes-button'))

    expect(await screen.findByTestId('request-changes-error')).toBeInTheDocument()
    expect(
      screen.queryByTestId('request-changes-success'),
    ).not.toBeInTheDocument()
  })
})
