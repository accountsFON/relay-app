import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CaptionDiffView } from '@/components/preview/caption-diff-view'
import type { DiffSegment } from '@/lib/text-diff'

describe('CaptionDiffView', () => {
  it('renders insert segments with green underline styling', () => {
    const segments: DiffSegment[] = [
      { type: 'equal', text: 'Welcome to our new ' },
      { type: 'insert', text: 'outdoor seating area' },
      { type: 'equal', text: '.' },
    ]

    render(<CaptionDiffView segments={segments} />)

    const inserts = screen.getAllByTestId('caption-diff-segment-insert')
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toHaveTextContent('outdoor seating area')
    const className = inserts[0].className
    expect(className).toContain('bg-green-50')
    expect(className).toContain('text-green-900')
    expect(className).toContain('underline')
  })

  it('renders delete segments with strikethrough styling', () => {
    const segments: DiffSegment[] = [
      { type: 'equal', text: 'Welcome to our new ' },
      { type: 'delete', text: 'patio space' },
      { type: 'equal', text: '.' },
    ]

    render(<CaptionDiffView segments={segments} />)

    const deletes = screen.getAllByTestId('caption-diff-segment-delete')
    expect(deletes).toHaveLength(1)
    expect(deletes[0]).toHaveTextContent('patio space')
    const className = deletes[0].className
    expect(className).toContain('line-through')
    expect(className).toContain('bg-red-50')
    expect(className).toContain('text-red-900')
  })

  it('renders newlines inside any segment as <br> elements (so paragraph restructures are visible)', () => {
    const segments: DiffSegment[] = [
      { type: 'equal', text: 'Foo\n' },
      { type: 'delete', text: '\n' },
      { type: 'equal', text: 'Bar' },
    ]

    const { container } = render(<CaptionDiffView segments={segments} />)

    // At minimum there must be one <br> for each newline char in the segments
    // (Foo\n contributes one, \n contributes one). Otherwise paragraph
    // restructures would be invisible.
    const brs = container.querySelectorAll('br')
    expect(brs.length).toBeGreaterThanOrEqual(2)

    // The delete segment specifically must render its newline as a <br>, not
    // as collapsed whitespace.
    const deleteNewlines = screen.getAllByTestId('caption-diff-newline-delete')
    expect(deleteNewlines.length).toBeGreaterThanOrEqual(1)
  })
})
