import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// SignOutButton is a Clerk client component; stub it so the render under
// jsdom does not try to mount the real provider-backed component.
vi.mock('@clerk/nextjs', () => ({
  SignOutButton: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sign-out-button">{children}</div>
  ),
}))

import InviteOnlyPage from '@/app/invite-only/page'

describe('InviteOnlyPage', () => {
  it('renders the invite-only message and a sign-out affordance', () => {
    render(<InviteOnlyPage />)
    expect(screen.getByText(/invite-only/i)).toBeInTheDocument()
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument()
  })
})
