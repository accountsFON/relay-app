import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QaEditedIndicator } from '@/components/posts/qa-edited-indicator'

describe('QaEditedIndicator', () => {
  it('renders "Edited by QA bot" when preQaCaption is set', () => {
    render(<QaEditedIndicator preQaCaption="original text" />)
    expect(screen.getByText('Edited by QA bot')).toBeInTheDocument()
  })

  it('renders nothing when preQaCaption is null', () => {
    const { container } = render(<QaEditedIndicator preQaCaption={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when preQaCaption is undefined', () => {
    const { container } = render(<QaEditedIndicator preQaCaption={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when preQaCaption is an empty string', () => {
    const { container } = render(<QaEditedIndicator preQaCaption="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('applies muted-italic Tailwind classes', () => {
    render(<QaEditedIndicator preQaCaption="x" />)
    const el = screen.getByText('Edited by QA bot')
    expect(el).toHaveClass('text-xs')
    expect(el).toHaveClass('italic')
    expect(el).toHaveClass('text-muted-foreground')
  })
})
