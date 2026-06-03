import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// SignOutButton renders its children; stub it so we do not need Clerk context.
vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import NoAccessPage from '@/app/(app)/no-access/page'

describe('NoAccessPage', () => {
  it('shows the account closed copy for reason=closed', async () => {
    const ui = await NoAccessPage({
      searchParams: Promise.resolve({ reason: 'closed' }),
    })
    render(ui)
    expect(screen.getByText(/your account is closed/i)).toBeInTheDocument()
  })

  it('shows the default no-access copy otherwise', async () => {
    const ui = await NoAccessPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByText(/no access to this agency/i)).toBeInTheDocument()
  })
})
