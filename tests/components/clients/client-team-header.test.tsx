import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientTeamHeader } from '@/components/clients/client-team-header'

const setClientPrimaryMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/app/(app)/admin/clients/actions', () => ({
  setClientPrimary: (input: unknown) => setClientPrimaryMock(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const morgan = { id: 'u1', name: 'Morgan AM', avatarUrl: null }
const dakota = { id: 'u2', name: 'Dakota Designer', avatarUrl: null }
const amOptions = [{ id: 'u1', name: 'Morgan AM' }]
const designerOptions = [{ id: 'u2', name: 'Dakota Designer' }]

describe('ClientTeamHeader', () => {
  beforeEach(() => {
    setClientPrimaryMock.mockReset()
    refreshMock.mockReset()
  })

  it('renders AM and Designer names read-only when canManage is false', () => {
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={morgan}
        designer={dakota}
        amOptions={amOptions}
        designerOptions={designerOptions}
        canManage={false}
      />,
    )
    expect(screen.getByText('Morgan AM')).toBeInTheDocument()
    expect(screen.getByText('Dakota Designer')).toBeInTheDocument()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  it('renders both as dropdowns when canManage is true', () => {
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={morgan}
        designer={dakota}
        amOptions={amOptions}
        designerOptions={designerOptions}
        canManage
      />,
    )
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    expect(selects[0]).toHaveValue('u1')
    expect(selects[1]).toHaveValue('u2')
  })

  it('shows "Unassigned" when no AM is set and canManage is false', () => {
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={null}
        designer={dakota}
        amOptions={amOptions}
        designerOptions={designerOptions}
        canManage={false}
      />,
    )
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument()
  })

  it('calls setClientPrimary on AM dropdown change', async () => {
    setClientPrimaryMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={null}
        designer={null}
        amOptions={amOptions}
        designerOptions={designerOptions}
        canManage
      />,
    )
    const amSelect = screen.getByLabelText(/reassign account manager/i)
    await user.selectOptions(amSelect, 'u1')
    expect(setClientPrimaryMock).toHaveBeenCalledWith({
      clientId: 'c1',
      slot: 'am',
      userId: 'u1',
    })
  })

  it('sends userId=null when the user picks the unassigned option', async () => {
    setClientPrimaryMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <ClientTeamHeader
        clientId="c1"
        clientName="Cedar Creek Dental"
        am={morgan}
        designer={dakota}
        amOptions={amOptions}
        designerOptions={designerOptions}
        canManage
      />,
    )
    const designerSelect = screen.getByLabelText(/reassign designer/i)
    await user.selectOptions(designerSelect, '')
    expect(setClientPrimaryMock).toHaveBeenCalledWith({
      clientId: 'c1',
      slot: 'designer',
      userId: null,
    })
  })
})
