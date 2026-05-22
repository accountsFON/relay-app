import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Asterisk } from '@/components/decorations/asterisk'

describe('<Asterisk>', () => {
  it('renders an svg with default props', () => {
    const { container } = render(<Asterisk />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('width')).toBe('32')
  })

  it('accepts custom color via prop', () => {
    const { container } = render(<Asterisk color="#FFE786" />)
    const rect = container.querySelector('rect')
    expect(rect?.getAttribute('fill')).toBe('#FFE786')
  })
})
