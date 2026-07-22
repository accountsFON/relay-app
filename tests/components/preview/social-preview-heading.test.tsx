import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SocialPreviewHeading } from '@/components/preview/social-preview-heading'

describe('SocialPreviewHeading', () => {
  it('renders the "Social Preview" label', () => {
    render(<SocialPreviewHeading />)
    expect(screen.getByRole('heading', { name: 'Social Preview' })).toBeTruthy()
  })

  it('merges a passed className', () => {
    render(<SocialPreviewHeading className="mb-4" />)
    const heading = screen.getByRole('heading', { name: 'Social Preview' })
    expect(heading.className).toContain('mb-4')
  })
})
