import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DecisionButtonRow } from '@/components/review/decision-button-row'

describe('DecisionButtonRow', () => {
  it('renders three buttons with the correct active state and aria-pressed', () => {
    render(<DecisionButtonRow value="approved" onChange={() => {}} />)

    const approve = screen.getByTestId('decision-button-approved')
    const changes = screen.getByTestId('decision-button-changes_requested')
    const edit = screen.getByTestId('decision-button-caption_edited')

    expect(approve).toHaveAttribute('aria-pressed', 'true')
    expect(approve).toHaveAttribute('aria-label', 'Approve this post')
    expect(changes).toHaveAttribute('aria-pressed', 'false')
    expect(edit).toHaveAttribute('aria-pressed', 'false')
  })

  it('fires onChange with the right decision when a button is tapped', () => {
    const onChange = vi.fn()
    render(<DecisionButtonRow value="not_reviewed" onChange={onChange} />)

    fireEvent.click(screen.getByTestId('decision-button-changes_requested'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('changes_requested')

    fireEvent.click(screen.getByTestId('decision-button-caption_edited'))
    expect(onChange).toHaveBeenLastCalledWith('caption_edited')
  })

  it('disables all buttons when disabled prop is set', () => {
    const onChange = vi.fn()
    render(<DecisionButtonRow value="not_reviewed" onChange={onChange} disabled />)

    const approve = screen.getByTestId('decision-button-approved')
    expect(approve).toBeDisabled()

    fireEvent.click(approve)
    expect(onChange).not.toHaveBeenCalled()
  })
})
