import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const usePathnameMock = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}))

import { SettingsTabs } from '@/components/settings/settings-tabs'

describe('SettingsTabs', () => {
  it('renders both tabs as links', () => {
    usePathnameMock.mockReturnValue('/settings/org')
    render(<SettingsTabs />)
    expect(screen.getByRole('link', { name: /agency/i })).toHaveAttribute(
      'href',
      '/settings/org',
    )
    expect(screen.getByRole('link', { name: /account/i })).toHaveAttribute(
      'href',
      '/settings/account',
    )
  })

  it('marks the active tab with aria-current', () => {
    usePathnameMock.mockReturnValue('/settings/account')
    render(<SettingsTabs />)
    expect(
      screen.getByRole('link', { name: /account/i }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('link', { name: /agency/i }),
    ).not.toHaveAttribute('aria-current')
  })
})
