import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Linkify } from '@/components/ui/linkify'

describe('Linkify', () => {
  it('renders URLs as links that open in a new tab', () => {
    render(<Linkify text="check https://example.com/x out" />)
    const link = screen.getByRole('link', { name: 'https://example.com/x' })
    expect(link).toHaveAttribute('href', 'https://example.com/x')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders bare www. URLs with an https href', () => {
    render(<Linkify text="go to www.example.com" />)
    expect(screen.getByRole('link', { name: 'www.example.com' })).toHaveAttribute(
      'href',
      'https://www.example.com',
    )
  })

  it('renders plain text with no links when there is no URL', () => {
    render(<Linkify text="just words here" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('just words here')).toBeInTheDocument()
  })
})
