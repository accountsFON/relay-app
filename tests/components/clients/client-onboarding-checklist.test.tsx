import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@/app/(app)/clients/actions', () => ({
  setClientOnboardingItemAction: vi.fn().mockResolvedValue(undefined),
  completeClientOnboardingAction: vi.fn().mockResolvedValue(undefined),
}))

import {
  setClientOnboardingItemAction,
  completeClientOnboardingAction,
} from '@/app/(app)/clients/actions'
import { ClientOnboardingChecklist } from '@/components/clients/client-onboarding-checklist'

beforeEach(() => vi.clearAllMocks())
const base = { clientId: 'c1' }

describe('ClientOnboardingChecklist', () => {
  it('disables Complete onboarding until all three are checked', () => {
    render(<ClientOnboardingChecklist {...base} initial={{ account: true, designFolder: true, assets: false }} />)
    expect(screen.getByRole('button', { name: /complete onboarding/i })).toBeDisabled()
  })
  it('enables Complete onboarding when all three are checked and fires the action', () => {
    render(<ClientOnboardingChecklist {...base} initial={{ account: true, designFolder: true, assets: true }} />)
    const btn = screen.getByRole('button', { name: /complete onboarding/i })
    expect(btn).toBeEnabled()
    fireEvent.click(btn)
    expect(completeClientOnboardingAction).toHaveBeenCalledWith('c1')
  })
  it('ticking an item persists via the action and re-enables the button', async () => {
    render(<ClientOnboardingChecklist {...base} initial={{ account: true, designFolder: true, assets: false }} />)
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/assets received/i))
    })
    expect(setClientOnboardingItemAction).toHaveBeenCalledWith('c1', 'assets', true)
    expect(screen.getByRole('button', { name: /complete onboarding/i })).toBeEnabled()
  })
})
