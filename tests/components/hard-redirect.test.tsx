import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

// The stubbed location (empty href) breaks next/image URL resolution; the
// image is irrelevant to what we're testing, so stub it out.
vi.mock('next/image', () => ({ default: () => null }))

import { HardRedirect } from '@/components/hard-redirect'

let replace: ReturnType<typeof vi.fn>

beforeEach(() => {
  replace = vi.fn()
  // jsdom's location.replace is non-configurable; replace the whole object.
  vi.stubGlobal('location', { replace, href: '', origin: 'http://localhost' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HardRedirect', () => {
  it('does a full-document navigation (location.replace) to the target on mount', () => {
    render(<HardRedirect to="/welcome" />)
    expect(replace).toHaveBeenCalledWith('/welcome')
  })
})
