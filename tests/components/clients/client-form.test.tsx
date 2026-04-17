import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientForm } from '@/components/clients/client-form'

describe('ClientForm', () => {
  it('renders all major sections', () => {
    render(<ClientForm mode="create" onSubmit={vi.fn()} />)
    // Section headings are uppercased so match exact text
    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText('Brand')).toBeInTheDocument()
    expect(screen.getByText('Strategy')).toBeInTheDocument()
    expect(screen.getByText('Scheduling')).toBeInTheDocument()
    expect(screen.getByText('Assets')).toBeInTheDocument()
  })

  it('shows "Create client" button in create mode', () => {
    render(<ClientForm mode="create" onSubmit={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /create client/i })
    ).toBeInTheDocument()
  })

  it('shows "Save changes" button in edit mode', () => {
    render(
      <ClientForm
        mode="edit"
        defaultValues={{
          name: 'Akkoo',
          postingDays: 'Mon,Wed,Fri',
          holidayHandling: 'Major-US',
          urls: [],
          excludedDates: [],
          status: 'active',
        }}
        onSubmit={vi.fn()}
      />
    )
    expect(
      screen.getByRole('button', { name: /save changes/i })
    ).toBeInTheDocument()
  })

  it('pre-fills values from defaultValues', () => {
    render(
      <ClientForm
        mode="edit"
        defaultValues={{
          name: 'Akkoo Coffee',
          postingDays: 'Mon,Wed,Fri',
          holidayHandling: 'Major-US',
          urls: [],
          excludedDates: [],
          status: 'active',
        }}
        onSubmit={vi.fn()}
      />
    )
    const nameInput = screen.getByLabelText(/^name$/i) as HTMLInputElement
    expect(nameInput.value).toBe('Akkoo Coffee')
  })

  it('calls onSubmit with parsed input when submitted with valid data', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<ClientForm mode="create" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/^name$/i), 'New Client')
    await user.click(screen.getByRole('button', { name: /create client/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Client' })
    )
  })

  it('does not call onSubmit when name is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<ClientForm mode="create" onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: /create client/i }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('converts CSV urls string into array when submitted', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(<ClientForm mode="create" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/^name$/i), 'Test')
    await user.type(
      screen.getByLabelText(/^URLs$/i),
      'https://example.com, https://example.com/about'
    )
    await user.click(screen.getByRole('button', { name: /create client/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        urls: ['https://example.com', 'https://example.com/about'],
      })
    )
  })
})
