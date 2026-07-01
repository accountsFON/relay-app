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

  it('lets the Assets/Canva blocks wrap instead of colliding when links overflow (regression)', () => {
    // With many links the Links block wraps to multiple rows; the top-level
    // row must wrap so the Assets + Canva blocks drop to a new line instead
    // of being squeezed together and bleeding past the card edge.
    const { container } = render(
      <ClientQuickAccess
        urls={['https://example.com']}
        assetsFolderUrl="https://drive.google.com/folder/X"
        canvaUrl="https://www.canva.com/design/ABC"
      />,
    )
    const row = container.querySelector('.sm\\:flex-row') as HTMLElement | null
    expect(row).not.toBeNull()
    // The row wraps (so blocks reflow instead of overflowing).
    expect(row?.className).toContain('flex-wrap')
    // The Assets block must not be squeezed below its content.
    const assetsBlock = container.querySelector('.sm\\:ml-auto') as HTMLElement | null
    expect(assetsBlock?.className).toContain('shrink-0')
    expect(assetsBlock?.className).not.toContain('min-w-0')
    // The Canva block (last child of the row) must not be squeezed either.
    const canvaBlock = row?.lastElementChild as HTMLElement | null
    expect(canvaBlock?.className).toContain('shrink-0')
    expect(canvaBlock?.className).not.toContain('min-w-0')
  })
})
