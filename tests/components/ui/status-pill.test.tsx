import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/ui/status-pill'

describe('<StatusPill>', () => {
  it('renders plain variant with label only', () => {
    render(<StatusPill variant="plain">AM</StatusPill>)
    expect(screen.getByText('AM')).toBeInTheDocument()
  })

  it('renders dot variant with leading colored dot', () => {
    const { container } = render(
      <StatusPill variant="dot" dotColor="blue">
        Holder: Mollie
      </StatusPill>,
    )
    expect(container.querySelector('[data-status-dot]')).toBeInTheDocument()
    expect(screen.getByText('Holder: Mollie')).toBeInTheDocument()
  })

  it('renders accent variant with tinted bg', () => {
    const { container } = render(
      <StatusPill variant="accent" accent="blue">
        4d on step
      </StatusPill>,
    )
    expect(container.firstChild).toHaveClass('bg-blue-100')
  })
})
