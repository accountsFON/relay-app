import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeroBand } from '@/components/hero-band'

describe('<HeroBand>', () => {
  it('renders title', () => {
    render(<HeroBand title="My Relay" />)
    expect(screen.getByText('My Relay')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<HeroBand title="X" subtitle="Sub" />)
    expect(screen.getByText('Sub')).toBeInTheDocument()
  })

  it('renders breadcrumb items as links when href provided', () => {
    render(
      <HeroBand
        title="X"
        breadcrumb={[
          { label: 'My Relay', href: '/dashboard' },
          { label: 'Sicilian Village', href: '/clients/abc' },
          { label: 'June 2026' },
        ]}
      />
    )
    expect(screen.getByRole('link', { name: 'My Relay' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: 'Sicilian Village' })).toHaveAttribute('href', '/clients/abc')
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })

  it('applies blue-100 background', () => {
    const { container } = render(<HeroBand title="X" />)
    expect(container.firstChild).toHaveClass('bg-blue-100')
  })
})
