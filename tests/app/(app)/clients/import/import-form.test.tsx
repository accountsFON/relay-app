import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImportForm } from '@/app/(app)/clients/import/import-form'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/app/(app)/clients/import/actions', () => ({
  importClientsCsv: vi.fn(),
}))

describe('ImportForm — file picker', () => {
  it('renders "Choose file" as a real clickable button, with "No file chosen" beside it', () => {
    render(<ImportForm />)
    // A proper <button>, not the browser's native file-input chrome.
    expect(screen.getByRole('button', { name: /choose file/i })).toBeTruthy()
    expect(screen.getByText(/no file chosen/i)).toBeTruthy()
  })

  it('shows the chosen filename after a file is selected', async () => {
    const { container } = render(<ImportForm />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['name\nAcme'], 'clients.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText('clients.csv')).toBeTruthy()
  })
})
