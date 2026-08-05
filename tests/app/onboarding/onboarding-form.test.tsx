import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// The onboarding submit calls the server action, then navigates. We stub the
// action so the test controls the returned destination.
vi.mock('@/app/onboarding/actions', () => ({ completeOnboarding: vi.fn() }))

import { completeOnboarding } from '@/app/onboarding/actions'
import { OnboardingForm } from '@/app/onboarding/onboarding-form'

let assign: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  assign = vi.fn()
  // jsdom's window.location.assign is non-configurable, so replace the whole
  // location object (idiomatic vitest) rather than spying on the method.
  vi.stubGlobal('location', { assign, href: '', origin: 'http://localhost' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OnboardingForm post-submit navigation', () => {
  // Regression for the brand-new-signup bug: the server action used to
  // redirect() to /welcome, and that server-action navigation delivered
  // /welcome non-interactive (dead buttons, tour never fired) until a manual
  // reload. The fix returns the destination and the client performs a FULL
  // document navigation, which is guaranteed to hydrate (a plain refresh --
  // itself a full load -- was the user's own proven workaround).
  it('does a full-document navigation to the destination the action returns', async () => {
    vi.mocked(completeOnboarding).mockResolvedValue({ redirectTo: '/welcome' })

    render(<OnboardingForm isInvite creationEnabled={false} inviteTicket="" />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'New Person' },
    })
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/welcome'))
  })

  it('passes the invite ticket through to the action', async () => {
    vi.mocked(completeOnboarding).mockResolvedValue({ redirectTo: '/welcome' })

    render(
      <OnboardingForm isInvite creationEnabled={false} inviteTicket="tkt_123" />,
    )
    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Invited Person' },
    })
    fireEvent.click(screen.getByRole('button', { name: /get started/i }))

    await waitFor(() => expect(completeOnboarding).toHaveBeenCalled())
    const fd = vi.mocked(completeOnboarding).mock.calls[0][0] as FormData
    expect(fd.get('inviteTicket')).toBe('tkt_123')
    expect(fd.get('displayName')).toBe('Invited Person')
  })
})
