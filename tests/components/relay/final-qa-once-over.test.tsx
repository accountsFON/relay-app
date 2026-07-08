import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FinalQaOnceOver } from '@/components/relay/final-qa-once-over'
import { QA_ONCE_OVER_ITEMS } from '@/lib/relay-final-qa'

describe('FinalQaOnceOver', () => {
  it('renders every once-over item as a checkbox', () => {
    render(<FinalQaOnceOver checked={{}} onToggle={() => {}} />)
    for (const label of QA_ONCE_OVER_ITEMS) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument()
    }
  })
  it('calls onToggle with the item index and next value', () => {
    const onToggle = vi.fn()
    render(<FinalQaOnceOver checked={{}} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('checkbox', { name: QA_ONCE_OVER_ITEMS[0] }))
    expect(onToggle).toHaveBeenCalledWith(0, true)
  })
})
