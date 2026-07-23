import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportForm } from '@/app/(app)/clients/import/import-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/app/(app)/clients/import/actions', () => ({
  importClientsCsv: vi.fn(),
  analyzeClientsCsv: vi.fn(async () => ({
    ok: true,
    headers: ['Name', 'Industry'],
    suggested: { name: 'Name', industry: 'Industry' },
    rowCount: 1,
  })),
}))

function selectFile(container: HTMLElement, contents = 'Name,Industry\nAcme,Coffee') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([contents], 'clients.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImportForm — file picker', () => {
  it('renders "Choose file" as a real clickable button, with "No file chosen" beside it', () => {
    render(<ImportForm />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy()
    expect(screen.getByText(/no file chosen/i)).toBeTruthy()
  })

  it('shows the chosen filename after a file is selected', async () => {
    const { container } = render(<ImportForm />)
    selectFile(container)
    expect(await screen.findByText('clients.csv')).toBeTruthy()
  })
})

describe('ImportForm — column mapping step', () => {
  it('shows the mapping step with the Name field pre-mapped from the analysis', async () => {
    const { container } = render(<ImportForm />)
    selectFile(container)
    expect(await screen.findByText(/map your columns/i)).toBeTruthy()
    const nameSelect = screen.getByLabelText('Column for Name') as HTMLSelectElement
    expect(nameSelect.value).toBe('Name')
  })

  it('offers "— Ignore —" plus every CSV column as options for each field', async () => {
    const { container } = render(<ImportForm />)
    selectFile(container)
    await screen.findByText(/map your columns/i)
    const industrySelect = screen.getByLabelText('Column for Industry') as HTMLSelectElement
    const optionLabels = Array.from(industrySelect.options).map((o) => o.textContent)
    expect(optionLabels).toEqual(['— Ignore —', 'Name', 'Industry'])
  })

  it('disables Import until Name is mapped, and re-enables when it is', async () => {
    const { container } = render(<ImportForm />)
    selectFile(container)
    await screen.findByText(/map your columns/i)
    const importBtn = screen.getByRole('button', { name: /import clients/i }) as HTMLButtonElement
    expect(importBtn.disabled).toBe(false) // Name auto-mapped -> enabled

    // Unmap Name -> Import disabled + warning shown
    const nameSelect = screen.getByLabelText('Column for Name')
    fireEvent.change(nameSelect, { target: { value: '' } })
    expect(importBtn.disabled).toBe(true)
    expect(screen.getByText(/name is required/i)).toBeTruthy()
  })
})
