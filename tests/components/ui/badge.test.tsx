import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusDot } from '@/components/ui/badge'

describe('StatusDot', () => {
  it('gives a cancelled run a distinct muted dot (not the inactive fallback)', () => {
    const { container } = render(<StatusDot status="cancelled" />)
    const dot = container.querySelector('span')
    expect(dot).not.toBeNull()
    expect(dot!.className).toContain('bg-neutral-400')
    // Must NOT fall through to the inactive gray.
    expect(dot!.className).not.toContain('bg-neutral-300')
  })

  it('still falls back to the inactive gray for an unknown status', () => {
    const { container } = render(<StatusDot status="something-else" />)
    expect(container.querySelector('span')!.className).toContain('bg-neutral-300')
  })
})
