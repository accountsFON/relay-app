import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BatchCompletionLap } from '@/components/relay/batch-completion-lap'

const morgan = { id: 'u1', name: 'Morgan', avatarUrl: null }
const dakota = { id: 'u2', name: 'Dakota', avatarUrl: '/dakota.png' }
const client = { id: 'u3', name: 'Riley', avatarUrl: null }

describe('BatchCompletionLap', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the trophy and headline on first visit', () => {
    render(
      <BatchCompletionLap
        batchId="batch-1"
        participants={[morgan, dakota, client]}
      />,
    )
    expect(screen.getByText(/relay complete/i)).toBeInTheDocument()
    expect(screen.getByText(/3 of you/i)).toBeInTheDocument()
  })

  it('renders an avatar (or fallback) per participant', () => {
    render(
      <BatchCompletionLap
        batchId="batch-1"
        participants={[morgan, dakota, client]}
      />,
    )
    // Dakota has a URL — rendered as img with alt text
    expect(screen.getByAltText('Dakota')).toBeInTheDocument()
    // Morgan + client both render fallback titles
    expect(screen.getByTitle('Morgan')).toBeInTheDocument()
    expect(screen.getByTitle('Riley')).toBeInTheDocument()
  })

  it('gives the photo avatar max-w-none so it is not collapsed by the zero-width orbit', () => {
    // Regression: Tailwind Preflight sets `img { max-width: 100% }`. The avatar
    // lives in a 0px-wide orbit container, so without max-w-none the photo
    // collapses to ~0px and never shows in the lap. See batch-completion-lap.tsx.
    render(
      <BatchCompletionLap
        batchId="batch-1"
        participants={[morgan, dakota, client]}
      />,
    )
    expect(screen.getByAltText('Dakota')).toHaveClass('max-w-none')
  })

  it('shows the participant initials in the fallback avatar (not a blank icon)', () => {
    render(
      <BatchCompletionLap
        batchId="batch-1"
        participants={[morgan, dakota, client]}
      />,
    )
    // Photo-less participants render their initials so the lap is never blank.
    expect(screen.getByText('MO')).toBeInTheDocument() // Morgan
    expect(screen.getByText('RI')).toBeInTheDocument() // Riley
  })

  it('does not render twice — localStorage flag suppresses repeat visits', () => {
    const { unmount } = render(
      <BatchCompletionLap batchId="batch-1" participants={[morgan]} />,
    )
    expect(screen.getByText(/relay complete/i)).toBeInTheDocument()
    unmount()

    render(<BatchCompletionLap batchId="batch-1" participants={[morgan]} />)
    expect(screen.queryByText(/relay complete/i)).not.toBeInTheDocument()
  })

  it('still renders for a different batch even when another was celebrated', () => {
    window.localStorage.setItem('celebrated:batch-1', '1')
    render(<BatchCompletionLap batchId="batch-2" participants={[morgan]} />)
    expect(screen.getByText(/relay complete/i)).toBeInTheDocument()
  })

  it('renders nothing when the participants list is empty', () => {
    const { container } = render(
      <BatchCompletionLap batchId="batch-1" participants={[]} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('uses singular copy with a single participant', () => {
    render(<BatchCompletionLap batchId="batch-1" participants={[morgan]} />)
    expect(screen.getByText(/solid lap/i)).toBeInTheDocument()
  })
})
