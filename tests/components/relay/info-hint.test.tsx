// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InfoHint } from '@/components/relay/relay-tooltips'

describe('InfoHint', () => {
  it('renders a decorative, aria-hidden info glyph', () => {
    render(<InfoHint />)
    const hint = screen.getByTestId('tooltip-info-hint')
    expect(hint).toBeInTheDocument()
    expect(hint).toHaveAttribute('aria-hidden')
  })
})
