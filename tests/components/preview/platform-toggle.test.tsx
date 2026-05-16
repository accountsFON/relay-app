import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlatformToggle } from '@/components/preview/platform-toggle'

describe('PlatformToggle', () => {
  it('initial state respects the platform prop', () => {
    render(<PlatformToggle platform="instagram" onChange={() => {}} />)
    const ig = screen.getByRole('radio', { name: 'Instagram' })
    const fb = screen.getByRole('radio', { name: 'Facebook' })
    expect(ig).toHaveAttribute('aria-checked', 'true')
    expect(fb).toHaveAttribute('aria-checked', 'false')

    // Re-render with the other value, the active option flips.
    render(<PlatformToggle platform="facebook" onChange={() => {}} />)
    const igs = screen.getAllByRole('radio', { name: 'Instagram' })
    const fbs = screen.getAllByRole('radio', { name: 'Facebook' })
    expect(igs[1]).toHaveAttribute('aria-checked', 'false')
    expect(fbs[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('click toggles by calling onChange with the other value', () => {
    const onChange = vi.fn()
    render(<PlatformToggle platform="instagram" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Facebook' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('facebook')
  })

  it('keyboard-accessible (tab + space or enter triggers onChange)', () => {
    const onChange = vi.fn()
    render(<PlatformToggle platform="instagram" onChange={onChange} />)

    const fb = screen.getByRole('radio', { name: 'Facebook' })
    // Tab order: roving tabindex puts the inactive option at -1, so it
    // is reachable via ArrowRight from the active option, OR directly
    // focusable. Focus it manually to simulate the user landing on it.
    fb.focus()
    expect(fb).toHaveFocus()

    fireEvent.keyDown(fb, { key: ' ' })
    expect(onChange).toHaveBeenLastCalledWith('facebook')

    fireEvent.keyDown(fb, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('facebook')
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
