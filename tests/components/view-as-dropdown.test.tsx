import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const listTargets = vi.fn()
const start = vi.fn()
vi.mock('@/components/view-as-actions', () => ({
  listImpersonationTargets: (...a: unknown[]) => listTargets(...a),
  startViewAs: (...a: unknown[]) => start(...a),
}))

import { ViewAsDropdown } from '@/components/view-as-dropdown'

beforeEach(() => {
  vi.clearAllMocks()
  listTargets.mockResolvedValue([
    { userId: 'payton_1', name: 'Payton Monzon', email: 'payton@x.com', role: 'account_manager' },
    { userId: 'mollie_1', name: 'Mollie Huebner', email: 'mollie@x.com', role: 'designer' },
  ])
})

describe('ViewAsDropdown', () => {
  it('loads targets when opened and filters by query', async () => {
    render(<ViewAsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /view as/i }))
    await waitFor(() => expect(screen.getByText('Payton Monzon')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText(/search users/i), { target: { value: 'mollie' } })
    expect(screen.queryByText('Payton Monzon')).not.toBeInTheDocument()
    expect(screen.getByText('Mollie Huebner')).toBeInTheDocument()
  })

  it('calls startViewAs with the chosen user id', async () => {
    render(<ViewAsDropdown />)
    fireEvent.click(screen.getByRole('button', { name: /view as/i }))
    await waitFor(() => expect(screen.getByText('Payton Monzon')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Payton Monzon'))
    expect(start).toHaveBeenCalledWith('payton_1')
  })
})
