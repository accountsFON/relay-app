import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NectrConnectionCheck } from '@/components/clients/nectr-connection-check'
import { checkNectrConnectionAction } from '@/app/(app)/clients/actions'

vi.mock('@/app/(app)/clients/actions', () => ({ checkNectrConnectionAction: vi.fn() }))

describe('NectrConnectionCheck', () => {
  it('lists connected accounts with live / expired state on success', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({
      status: 'ok',
      accounts: [
        { id: 'a1', platform: 'facebook', name: 'Five One Nine', type: 'page', isExpired: false },
        { id: 'a2', platform: 'instagram', name: 'fiveonenine', type: 'profile', isExpired: true },
      ],
      serviceUserId: 'u1',
    })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    expect(await screen.findByText(/Five One Nine/)).toBeInTheDocument()
    expect(screen.getByText(/live/i)).toBeInTheDocument()
    expect(screen.getByText(/expired, reconnect in NECTR/i)).toBeInTheDocument()
    expect(checkNectrConnectionAction).toHaveBeenCalledWith('c1')
  })

  it('shows a no-location message', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({ status: 'no-location' })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/no nectr location id/i)).toBeInTheDocument()
  })

  it('shows the error message on failure', async () => {
    vi.mocked(checkNectrConnectionAction).mockResolvedValue({ status: 'error', message: 'NECTR API 403' })
    render(<NectrConnectionCheck clientId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))
    expect(await screen.findByText(/NECTR API 403/)).toBeInTheDocument()
  })
})
