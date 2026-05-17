import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StartNextRoundButton } from '@/components/review/start-next-round-button'

describe('StartNextRoundButton', () => {
  it('renders the next round number in the label', () => {
    render(<StartNextRoundButton magicLinkId="ml_1" nextRound={3} />)
    const btn = screen.getByTestId('start-next-round-button')
    expect(btn).toHaveTextContent('Start Round 3')
    expect(btn.getAttribute('data-magic-link-id')).toBe('ml_1')
    expect(btn.getAttribute('data-next-round')).toBe('3')
  })

  it('disables itself when disabled prop is set', () => {
    render(
      <StartNextRoundButton magicLinkId="ml_1" nextRound={2} disabled />,
    )
    expect(
      (screen.getByTestId('start-next-round-button') as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('invokes the onClick handler when clicked', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    render(
      <StartNextRoundButton magicLinkId="ml_1" nextRound={2} onClick={handler} />,
    )

    fireEvent.click(screen.getByTestId('start-next-round-button'))
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1))
  })

  it('falls back to console.log stub when no handler is provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    render(<StartNextRoundButton magicLinkId="ml_1" nextRound={2} />)

    fireEvent.click(screen.getByTestId('start-next-round-button'))
    await waitFor(() => expect(logSpy).toHaveBeenCalled())
    logSpy.mockRestore()
  })
})
