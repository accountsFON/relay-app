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
const riley = { id: 'u3', name: 'Riley Replacement', avatarUrl: null }
const amOptions = [
  { id: 'u1', name: 'Morgan AM' },
  { id: 'u3', name: 'Riley Replacement' },
]
const designerOptions = [
  { id: 'u2', name: 'Dakota Designer' },
  { id: 'u4', name: 'Quinn Designer' },
]

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

  it('does NOT call setClientPrimary when a new AM is picked until Confirm is clicked', async () => {
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
    const amSelect = screen.getByLabelText(/reassign account manager/i)
    await user.selectOptions(amSelect, 'u3')

    // Server action must not have been invoked yet.
    expect(setClientPrimaryMock).not.toHaveBeenCalled()

    // Dialog text should reference both names.
    expect(
      screen.getByText(/Reassign Account Manager for Cedar Creek Dental/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Morgan AM will no longer be the account manager/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Riley Replacement will be notified/i)).toBeInTheDocument()
  })

  it('reverts the select to the prior value when Cancel is clicked', async () => {
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
    const amSelect = screen.getByLabelText(
      /reassign account manager/i,
    ) as HTMLSelectElement
    await user.selectOptions(amSelect, 'u3')

    // Cancel the reassignment.
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(setClientPrimaryMock).not.toHaveBeenCalled()
    expect(amSelect.value).toBe('u1')
  })

  it('calls setClientPrimary with the new id when Confirm is clicked', async () => {
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
    const amSelect = screen.getByLabelText(/reassign account manager/i)
    await user.selectOptions(amSelect, 'u3')

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(setClientPrimaryMock).toHaveBeenCalledWith({
      clientId: 'c1',
      slot: 'am',
      userId: 'u3',
    })
  })

  it('sends userId=null when the designer is reassigned to Unassigned and confirmed', async () => {
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

    // Dialog should still show old name + Unassigned target in copy.
    expect(
      screen.getByText(/Dakota Designer will no longer be the designer/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirm/i }))

    expect(setClientPrimaryMock).toHaveBeenCalledWith({
      clientId: 'c1',
      slot: 'designer',
      userId: null,
    })
  })
})
