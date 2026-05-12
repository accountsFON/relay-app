import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClientQuickAccess } from '@/components/clients/client-quick-access'

describe('ClientQuickAccess', () => {
  it('renders nothing when all three sources are empty', () => {
    const { container } = render(
      <ClientQuickAccess urls={[]} assetsFolderUrl={null} canvaUrl={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders an "Open in Canva" link when canvaUrl is set', () => {
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

  it('omits the Canva pill when canvaUrl is empty string', () => {
    render(<ClientQuickAccess urls={[]} assetsFolderUrl={null} canvaUrl="" />)
    expect(
      screen.queryByRole('link', { name: /open in canva/i }),
    ).not.toBeInTheDocument()
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
