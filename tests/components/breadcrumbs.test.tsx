import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Breadcrumbs } from '@/components/breadcrumbs'

describe('Breadcrumbs', () => {
  it('renders each item in order with separators', () => {
    render(
      <Breadcrumbs
        items={[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/clients/c1', label: 'Cedar Creek Dental' },
          { label: 'Relay May 2026' },
        ]}
      />,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Cedar Creek Dental')).toBeInTheDocument()
    expect(screen.getByText('Relay May 2026')).toBeInTheDocument()
  })

  it('renders earlier items as links and the last item as plain text', () => {
    render(
      <Breadcrumbs
        items={[
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/clients/c1', label: 'Cedar Creek Dental' },
          { label: 'Relay May 2026' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(
      screen.getByRole('link', { name: 'Cedar Creek Dental' }),
    ).toHaveAttribute('href', '/clients/c1')
    expect(
      screen.queryByRole('link', { name: 'Relay May 2026' }),
    ).not.toBeInTheDocument()
  })

  it('marks the current crumb with aria-current=page', () => {
    render(
      <Breadcrumbs
        items={[
          { href: '/dashboard', label: 'Dashboard' },
          { label: 'Clients' },
        ]}
      />,
    )
    expect(screen.getByText('Clients')).toHaveAttribute('aria-current', 'page')
  })

  it('uses a nav element with aria-label Breadcrumb', () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: 'Only' }]} />,
    )
    const nav = container.querySelector('nav')
    expect(nav).not.toBeNull()
    expect(nav?.getAttribute('aria-label')).toBe('Breadcrumb')
  })
})
