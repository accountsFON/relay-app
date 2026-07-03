import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignerFlagToggle } from '@/components/review/designer-flag-toggle'

describe('DesignerFlagToggle', () => {
  it('not flagged: shows the flag button and clicking calls onFlag', async () => {
    const user = userEvent.setup()
    const onFlag = vi.fn().mockResolvedValue(undefined)
    render(
      <DesignerFlagToggle flag={null} onFlag={onFlag} onUnflag={vi.fn()} testId="ft" />,
    )
    const btn = screen.getByTestId('ft-flag')
    expect(btn).toHaveTextContent('Flag for designer')
    await user.click(btn)
    expect(onFlag).toHaveBeenCalledOnce()
  })

  it('flagged: shows the note input + unflag, typing then blur calls onFlag with the note', async () => {
    const user = userEvent.setup()
    const onFlag = vi.fn().mockResolvedValue(undefined)
    render(
      <DesignerFlagToggle
        flag={{ id: 'f1', note: null }}
        onFlag={onFlag}
        onUnflag={vi.fn()}
        testId="ft"
      />,
    )
    const input = screen.getByTestId('ft-note')
    await user.type(input, 'make it pop')
    await user.tab()
    expect(onFlag).toHaveBeenCalledWith('make it pop')
  })

  it('flagged: unflag calls onUnflag with the flag id', async () => {
    const user = userEvent.setup()
    const onUnflag = vi.fn().mockResolvedValue(undefined)
    render(
      <DesignerFlagToggle
        flag={{ id: 'f1', note: 'x' }}
        onFlag={vi.fn()}
        onUnflag={onUnflag}
        testId="ft"
      />,
    )
    await user.click(screen.getByTestId('ft-unflag'))
    expect(onUnflag).toHaveBeenCalledWith('f1')
  })

  it('does not call onFlag on blur when the note is unchanged', async () => {
    const user = userEvent.setup()
    const onFlag = vi.fn().mockResolvedValue(undefined)
    render(
      <DesignerFlagToggle
        flag={{ id: 'f1', note: 'same' }}
        onFlag={onFlag}
        onUnflag={vi.fn()}
        testId="ft"
      />,
    )
    const input = screen.getByTestId('ft-note')
    input.focus()
    await user.tab()
    expect(onFlag).not.toHaveBeenCalled()
  })

  it('rolls back the optimistic flagged state when onFlag rejects', async () => {
    const user = userEvent.setup()
    const onFlag = vi.fn().mockRejectedValueOnce(new Error('nope'))
    render(
      <DesignerFlagToggle flag={null} onFlag={onFlag} onUnflag={vi.fn()} testId="ft" />,
    )
    await user.click(screen.getByTestId('ft-flag'))
    // Rejection rolls the visual back to the not-flagged flag button
    expect(await screen.findByTestId('ft-flag')).toBeInTheDocument()
  })

  it('reconciles when the flag prop changes from the server', () => {
    const { rerender } = render(
      <DesignerFlagToggle flag={null} onFlag={vi.fn()} onUnflag={vi.fn()} testId="ft" />,
    )
    expect(screen.getByTestId('ft-flag')).toBeInTheDocument()
    rerender(
      <DesignerFlagToggle
        flag={{ id: 'f1', note: 'hi' }}
        onFlag={vi.fn()}
        onUnflag={vi.fn()}
        testId="ft"
      />,
    )
    expect(screen.getByTestId('ft-note')).toBeInTheDocument()
    expect((screen.getByTestId('ft-note') as HTMLInputElement).value).toBe('hi')
  })
})
