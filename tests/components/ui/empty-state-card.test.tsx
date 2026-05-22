import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyStateCard } from '@/components/ui/empty-state-card'

describe('<EmptyStateCard>', () => {
  it('renders the label', () => {
    render(<EmptyStateCard tint="blue" shape="asterisk" label="Nothing here yet" />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('applies tint class', () => {
    const { container } = render(
      <EmptyStateCard tint="coral" shape="asterisk" label="x" />,
    )
    expect(container.firstChild).toHaveClass('bg-coral-100')
  })

  it('renders an svg for the chosen shape', () => {
    const { container } = render(
      <EmptyStateCard tint="yellow" shape="asterisk" label="x" />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
