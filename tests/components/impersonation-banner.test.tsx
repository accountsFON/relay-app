import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const stop = vi.fn()
vi.mock('@/components/view-as-actions', () => ({ stopViewAs: (...a: unknown[]) => stop(...a) }))

import { ImpersonationBanner } from '@/components/impersonation-banner'

beforeEach(() => vi.clearAllMocks())

describe('ImpersonationBanner', () => {
  it('shows the target name and role', () => {
    render(<ImpersonationBanner targetName="Payton Monzon" role="account_manager" />)
    expect(screen.getByText(/Acting as Payton Monzon/i)).toBeInTheDocument()
  })
  it('calls stopViewAs when Exit is clicked', () => {
    render(<ImpersonationBanner targetName="Payton Monzon" role="account_manager" />)
    fireEvent.click(screen.getByRole('button', { name: /exit/i }))
    expect(stop).toHaveBeenCalled()
  })
})
