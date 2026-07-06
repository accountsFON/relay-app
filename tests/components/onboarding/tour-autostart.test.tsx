// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { TourAutostart } from '@/components/onboarding/tour-autostart'

const startIfUnseen = vi.fn()
vi.mock('@/components/onboarding/tour-provider', () => ({
  useTourController: () => ({ startIfUnseen }),
}))

beforeEach(() => vi.clearAllMocks())

describe('TourAutostart', () => {
  it('calls startIfUnseen with the tourId once on mount', () => {
    const { container } = render(<TourAutostart tourId="designer-batch-detail-v1" />)
    expect(startIfUnseen).toHaveBeenCalledTimes(1)
    expect(startIfUnseen).toHaveBeenCalledWith('designer-batch-detail-v1')
    expect(container).toBeEmptyDOMElement()
  })
})
