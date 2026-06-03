import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error('NEXT_REDIRECT:' + url)
  }),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))

vi.mock('@/server/repositories/users', () => ({ findUserByClerkId: vi.fn() }))

vi.mock('@/server/auth/agencyCreation', () => ({ isAgencyCreationEnabled: vi.fn() }))

// The form's server action import; stub so the page module loads under jsdom.
vi.mock('@/app/onboarding/actions', () => ({ completeOnboarding: vi.fn() }))

import { auth } from '@clerk/nextjs/server'
import { findUserByClerkId } from '@/server/repositories/users'
import { isAgencyCreationEnabled } from '@/server/auth/agencyCreation'
import OnboardingPage from '@/app/onboarding/page'

const noParams = Promise.resolve({})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OnboardingPage invite-only gate', () => {
  it('redirects a no-invite visitor to /invite-only when creation is OFF', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_new', orgId: null } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)

    await expect(OnboardingPage({ searchParams: noParams })).rejects.toThrow(
      'NEXT_REDIRECT:/invite-only',
    )
  })

  it('renders the name-only form for an invited user (no agency field)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_inv', orgId: 'clerk_org' } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(false)

    render(await OnboardingPage({ searchParams: noParams }))
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/agency name/i)).not.toBeInTheDocument()
  })

  it('renders the agency field when creation is ON (sell-mode)', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: 'clerk_new', orgId: null } as never)
    vi.mocked(findUserByClerkId).mockResolvedValue(null as never)
    vi.mocked(isAgencyCreationEnabled).mockReturnValue(true)

    render(await OnboardingPage({ searchParams: noParams }))
    expect(screen.getByLabelText(/agency name/i)).toBeInTheDocument()
  })
})
