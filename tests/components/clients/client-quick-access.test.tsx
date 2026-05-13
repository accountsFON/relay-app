import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClientQuickAccess } from '@/components/clients/client-quick-access'
import { FALLBACK_CANVA_FOLDER_URL } from '@/lib/canva'

describe('ClientQuickAccess', () => {
  it('renders the Canva fallback pill even when all three sources are empty', () => {
    render(
      <ClientQuickAccess urls={[]} assetsFolderUrl={null} canvaUrl={null} />,
    )
    const link = screen.getByRole('link', { name: /open in canva/i })
    expect(link).toHaveAttribute('href', FALLBACK_CANVA_FOLDER_URL)
  })

  it('renders an "Open in Canva" link with the per-client URL when canvaUrl is set', () => {
    render(
      <ClientQuickAccess
        urls={[]}
        assetsFolderUrl={null}
        canvaUrl="https://www.canva.com/design/ABC"
      />,
    )
    const link = screen.getByRole('link', { name: /open in canva/i })
    expect(link).toHaveAttribute('href', 'https://www.canva.com/design/ABC')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('falls back to the agency Canva folder when canvaUrl is empty string', () => {
    render(<ClientQuickAccess urls={[]} assetsFolderUrl={null} canvaUrl="" />)
    const link = screen.getByRole('link', { name: /open in canva/i })
    expect(link).toHaveAttribute('href', FALLBACK_CANVA_FOLDER_URL)
  })

  it('renders Canva alongside the other affordances when all are set', () => {
    render(
      <ClientQuickAccess
        urls={['https://example.com']}
        assetsFolderUrl="https://drive.google.com/folder/X"
        canvaUrl="https://www.canva.com/design/ABC"
      />,
    )
    expect(screen.getByText(/example\.com/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open folder/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open in canva/i })).toBeInTheDocument()
  })
})
