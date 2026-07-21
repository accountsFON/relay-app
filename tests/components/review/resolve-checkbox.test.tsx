import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResolveCheckbox } from '@/components/review/resolve-checkbox'

describe('ResolveCheckbox', () => {
  it('renders unresolved and calls onResolve on click, optimistically checking', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(
      <ResolveCheckbox label="Fix the spacing" resolved={false} onResolve={onResolve} onUnresolve={vi.fn()} testId="cb-1" />,
    )
    const box = screen.getByTestId('cb-1')
    expect(box.getAttribute('aria-checked')).toBe('false')
    await user.click(box)
    expect(onResolve).toHaveBeenCalledOnce()
    expect(box.getAttribute('aria-checked')).toBe('true')
  })

  it('renders resolved with line-through and calls onUnresolve on click', async () => {
    const user = userEvent.setup()
    const onUnresolve = vi.fn().mockResolvedValue(undefined)
    render(
      <ResolveCheckbox label="Approved copy" resolved={true} onResolve={vi.fn()} onUnresolve={onUnresolve} testId="cb-2" />,
    )
    expect(screen.getByTestId('cb-2-label').className).toMatch(/line-through/)
    await user.click(screen.getByTestId('cb-2'))
    expect(onUnresolve).toHaveBeenCalledOnce()
  })

  it('rolls back the optimistic state when the action rejects', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockRejectedValueOnce(new Error('nope'))
    render(
      <ResolveCheckbox label="x" resolved={false} onResolve={onResolve} onUnresolve={vi.fn()} testId="cb-3" />,
    )
    const box = screen.getByTestId('cb-3')
    await user.click(box)
    expect(box.getAttribute('aria-checked')).toBe('false')
  })

  it('reconciles when the resolved prop changes from the server', () => {
    const { rerender } = render(
      <ResolveCheckbox label="x" resolved={false} onResolve={vi.fn()} onUnresolve={vi.fn()} testId="cb-4" />,
    )
    expect(screen.getByTestId('cb-4').getAttribute('aria-checked')).toBe('false')
    rerender(
      <ResolveCheckbox label="x" resolved={true} onResolve={vi.fn()} onUnresolve={vi.fn()} testId="cb-4" />,
    )
    expect(screen.getByTestId('cb-4').getAttribute('aria-checked')).toBe('true')
  })

  // ---- onSelect: clicking the comment row opens the pin (rail -> canvas) ----

  it('calls onSelect when the comment row is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ResolveCheckbox
        label="change this image"
        resolved={false}
        onResolve={vi.fn()}
        onUnresolve={vi.fn()}
        onSelect={onSelect}
        testId="cb-5"
      />,
    )
    await user.click(screen.getByTestId('cb-5-label'))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('clicking the checkbox resolves WITHOUT also firing onSelect (siblings, no cross-fire)', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockResolvedValue(undefined)
    const onSelect = vi.fn()
    render(
      <ResolveCheckbox
        label="change this image"
        resolved={false}
        onResolve={onResolve}
        onUnresolve={vi.fn()}
        onSelect={onSelect}
        testId="cb-6"
      />,
    )
    await user.click(screen.getByTestId('cb-6'))
    expect(onResolve).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keyboard-activating the checkbox resolves WITHOUT firing onSelect', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockResolvedValue(undefined)
    const onSelect = vi.fn()
    render(
      <ResolveCheckbox
        label="change this image"
        resolved={false}
        onResolve={onResolve}
        onUnresolve={vi.fn()}
        onSelect={onSelect}
        testId="cb-7"
      />,
    )
    const checkbox = screen.getByTestId('cb-7')
    checkbox.focus()
    await user.keyboard(' ')
    expect(onResolve).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
