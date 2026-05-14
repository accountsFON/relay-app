import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import AppLoading from '@/app/(app)/loading'

describe('AppLoading', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppLoading />)
    expect(container.firstChild).not.toBeNull()
  })

  it('renders skeleton blocks with the brand pulse class', () => {
    const { container } = render(<AppLoading />)
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    // 2 in the header (title + subtitle) + 3 content blocks = 5
    expect(skeletons.length).toBe(5)
    skeletons.forEach((el) => {
      expect(el.className).toMatch(/animate-pulse/)
    })
  })
})
