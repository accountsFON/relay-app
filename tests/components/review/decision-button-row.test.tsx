import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DecisionButtonRow } from '@/components/review/decision-button-row'

describe('DecisionButtonRow', () => {
  it('renders exactly two buttons (Approve + Changes) and no Edit Copy', () => {
    render(<DecisionButtonRow value="approved" onChange={() => {}} />)

    expect(screen.getByTestId('decision-button-approved')).toBeInTheDocument()
    expect(
      screen.getByTestId('decision-button-changes_requested'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('decision-button-caption_edited'),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('marks Approve active only when the value is approved', () => {
    render(<DecisionButtonRow value="approved" onChange={() => {}} />)
    expect(screen.getByTestId('decision-button-approved')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(
      screen.getByTestId('decision-button-changes_requested'),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks Changes active for both changes_requested and caption_edited', () => {
    const { rerender } = render(
      <DecisionButtonRow value="changes_requested" onChange={() => {}} />,
    )
    expect(
      screen.getByTestId('decision-button-changes_requested'),
    ).toHaveAttribute('aria-pressed', 'true')

    rerender(<DecisionButtonRow value="caption_edited" onChange={() => {}} />)
    expect(
      screen.getByTestId('decision-button-changes_requested'),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('decision-button-approved')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('fires onChange with approved / changes_requested when tapped', () => {
    const onChange = vi.fn()
    render(<DecisionButtonRow value="not_reviewed" onChange={onChange} />)

    fireEvent.click(screen.getByTestId('decision-button-approved'))
    expect(onChange).toHaveBeenLastCalledWith('approved')

    fireEvent.click(screen.getByTestId('decision-button-changes_requested'))
    expect(onChange).toHaveBeenLastCalledWith('changes_requested')
  })

  it('disables both buttons when disabled prop is set', () => {
    const onChange = vi.fn()
    render(
      <DecisionButtonRow value="not_reviewed" onChange={onChange} disabled />,
    )
    const approve = screen.getByTestId('decision-button-approved')
    expect(approve).toBeDisabled()
    fireEvent.click(approve)
    expect(onChange).not.toHaveBeenCalled()
  })
})
