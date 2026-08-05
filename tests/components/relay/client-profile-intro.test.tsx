import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ClientProfileIntro } from '@/components/relay/client-profile-intro'

const SEEN_KEY = 'relay:client-profile-intro-seen-v1'

describe('ClientProfileIntro', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the explainer on first open (nothing in localStorage)', async () => {
    render(<ClientProfileIntro clientName="Acme" />)
    // Revealed by the post-mount "seen" check.
    expect(await screen.findByTestId('client-profile-intro')).toBeInTheDocument()
    // Names the client so the copy is specific.
    expect(screen.getByTestId('client-profile-intro')).toHaveTextContent('Acme')
  })

  it('dismisses, hides itself, and persists the seen flag', async () => {
    render(<ClientProfileIntro clientName="Acme" />)
    await screen.findByTestId('client-profile-intro')

    fireEvent.click(screen.getByTestId('client-profile-intro-dismiss'))

    expect(screen.queryByTestId('client-profile-intro')).not.toBeInTheDocument()
    expect(localStorage.getItem(SEEN_KEY)).toBe('1')
  })

  it('does not show again once the seen flag is set', () => {
    localStorage.setItem(SEEN_KEY, '1')
    render(<ClientProfileIntro clientName="Acme" />)
    expect(screen.queryByTestId('client-profile-intro')).not.toBeInTheDocument()
  })
})
