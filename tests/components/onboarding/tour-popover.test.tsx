import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TourPopover, type TourStop } from '@/components/onboarding/tour-popover'

const stops: TourStop[] = [
  {
    id: 'a',
    anchorSelector: '[data-tour-anchor="a"]',
    title: 'Stop A',
    body: 'Body A',
  },
  {
    id: 'b',
    anchorSelector: '[data-tour-anchor="b"]',
    title: 'Stop B',
    body: 'Body B',
  },
  {
    id: 'c',
    anchorSelector: '[data-tour-anchor="c"]',
    title: 'Stop C',
    body: 'Body C',
  },
]

describe('TourPopover', () => {
  it('renders the stop matching currentIndex', () => {
    render(
      <TourPopover
        stops={stops}
        currentIndex={1}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    )

    expect(screen.getByTestId('tour-popover')).toBeInTheDocument()
    expect(screen.getByTestId('tour-popover-stop-b')).toBeInTheDocument()
    expect(screen.queryByTestId('tour-popover-stop-a')).not.toBeInTheDocument()
    expect(screen.getByText('Stop B')).toBeInTheDocument()
    expect(screen.getByText('Body B')).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  })

  it('shows "Next" on non-last stops and "Got it" on the last stop', () => {
    const { rerender } = render(
      <TourPopover
        stops={stops}
        currentIndex={0}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    expect(screen.getByTestId('tour-popover-next')).toHaveTextContent('Next')

    rerender(
      <TourPopover
        stops={stops}
        currentIndex={2}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    expect(screen.getByTestId('tour-popover-next')).toHaveTextContent('Got it')
  })

  it('fires onNext when the primary button is clicked', () => {
    const onNext = vi.fn()
    render(
      <TourPopover
        stops={stops}
        currentIndex={0}
        onNext={onNext}
        onSkip={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('tour-popover-next'))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('fires onSkip when the Skip link is clicked, on every stop', () => {
    const onSkip = vi.fn()
    const { rerender } = render(
      <TourPopover
        stops={stops}
        currentIndex={0}
        onNext={vi.fn()}
        onSkip={onSkip}
      />,
    )

    // Skip on stop 1
    fireEvent.click(screen.getByTestId('tour-popover-skip'))
    expect(onSkip).toHaveBeenCalledTimes(1)

    // Re-render on stop 2 and Skip still works
    rerender(
      <TourPopover
        stops={stops}
        currentIndex={1}
        onNext={vi.fn()}
        onSkip={onSkip}
      />,
    )
    fireEvent.click(screen.getByTestId('tour-popover-skip'))
    expect(onSkip).toHaveBeenCalledTimes(2)

    // ...and on the last stop too
    rerender(
      <TourPopover
        stops={stops}
        currentIndex={2}
        onNext={vi.fn()}
        onSkip={onSkip}
      />,
    )
    fireEvent.click(screen.getByTestId('tour-popover-skip'))
    expect(onSkip).toHaveBeenCalledTimes(3)
  })

  it('fires onClose when the X is clicked', () => {
    const onClose = vi.fn()
    render(
      <TourPopover
        stops={stops}
        currentIndex={0}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByTestId('tour-popover-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fires onClose when ESC is pressed', () => {
    const onClose = vi.fn()
    render(
      <TourPopover
        stops={stops}
        currentIndex={0}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when currentIndex is out of bounds', () => {
    const { container } = render(
      <TourPopover
        stops={stops}
        currentIndex={99}
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
