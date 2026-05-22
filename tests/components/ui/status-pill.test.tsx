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

  it('renders leading icon when provided', () => {
    render(
      <StatusPill
        variant="plain"
        leadingIcon={<svg data-testid="leading-icon" />}
      >
        label
      </StatusPill>,
    )
    expect(screen.getByTestId('leading-icon')).toBeInTheDocument()
  })

  it('applies hover class when hoverable=true', () => {
    const { container } = render(
      <StatusPill variant="plain" hoverable>
        x
      </StatusPill>,
    )
    expect(container.firstChild).toHaveClass('hover:bg-neutral-50')
  })
})
