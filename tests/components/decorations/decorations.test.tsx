import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Asterisk } from '@/components/decorations/asterisk'
import { Blob } from '@/components/decorations/blob'
import { Starburst } from '@/components/decorations/starburst'
import { MultiStarburst } from '@/components/decorations/multi-starburst'
import { Sparkle } from '@/components/decorations/sparkle'
import { Wave } from '@/components/decorations/wave'
import { HalfMoon } from '@/components/decorations/half-moon'
import { Pinwheel } from '@/components/decorations/pinwheel'
import { Ribbon } from '@/components/decorations/ribbon'
import { DoubleCircle } from '@/components/decorations/double-circle'
import { HeroDecoration } from '@/components/decorations/hero-decoration'
import { DecorationCorner } from '@/components/decorations/decoration-corner'

describe('decoration shapes — smoke', () => {
  const cases = [
    { name: 'Asterisk', Component: Asterisk },
    { name: 'Blob', Component: Blob },
    { name: 'Starburst', Component: Starburst },
    { name: 'MultiStarburst', Component: MultiStarburst },
    { name: 'Sparkle', Component: Sparkle },
    { name: 'Wave', Component: Wave },
    { name: 'HalfMoon', Component: HalfMoon },
    { name: 'Pinwheel', Component: Pinwheel },
    { name: 'Ribbon', Component: Ribbon },
    { name: 'DoubleCircle', Component: DoubleCircle },
  ] as const

  cases.forEach(({ name, Component }) => {
    it(`<${name}> renders an svg with aria-hidden`, () => {
      const { container } = render(<Component />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg?.getAttribute('aria-hidden')).toBe('true')
    })

    it(`<${name}> applies className prop`, () => {
      const { container } = render(<Component className="test-class" />)
      expect(container.querySelector('svg.test-class')).toBeInTheDocument()
    })

    it(`<${name}> accepts a custom color`, () => {
      const { container } = render(<Component color="#FFE786" />)
      const filled = container.querySelector('[fill="#FFE786"]')
      expect(filled).not.toBeNull()
    })
  })
})

describe('<HeroDecoration>', () => {
  it('renders the four-shape cluster', () => {
    const { container } = render(<HeroDecoration />)
    const svgs = container.querySelectorAll('svg')
    // blob + asterisk + starburst = 3 svgs, plus the dot div (no svg)
    expect(svgs.length).toBe(3)
  })

  it('applies className override on the wrapper', () => {
    const { container } = render(<HeroDecoration className="custom-cluster" />)
    expect(container.querySelector('.custom-cluster')).toBeInTheDocument()
  })

  it('accepts per-shape color overrides', () => {
    const { container } = render(
      <HeroDecoration colors={{ blob: '#123456', asterisk: '#abcdef' }} />,
    )
    expect(container.querySelector('[fill="#123456"]')).not.toBeNull()
    expect(container.querySelector('[fill="#abcdef"]')).not.toBeNull()
  })
})

describe('<DecorationCorner>', () => {
  it('renders the corner cluster, pointer-events disabled', () => {
    const { container } = render(<DecorationCorner />)
    const wrapper = container.querySelector('div[aria-hidden="true"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className).toContain('pointer-events-none')
  })
})
