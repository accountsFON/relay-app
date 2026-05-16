import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaptionMarkup } from '@/components/preview/caption-markup'

/**
 * The jsdom Selection API works on text nodes. To drive it deterministically
 * we grab the caption's text node directly, build a Range, and dispatch the
 * selectionchange event the component listens for.
 */
function selectRange(container: HTMLElement, from: number, to: number) {
  // The component renders the caption inside a wrapper span; the text node we
  // want is the first text node inside [data-testid="caption-markup-text"].
  const textHost = container.querySelector(
    '[data-testid="caption-markup-text"]',
  ) as HTMLElement
  // Walk for a text node big enough to host the range.
  const walker = document.createTreeWalker(textHost, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  let cursor = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  while (node) {
    const len = node.data.length
    if (startNode === null && cursor + len >= from) {
      startNode = node
      startOffset = from - cursor
    }
    if (endNode === null && cursor + len >= to) {
      endNode = node
      endOffset = to - cursor
      break
    }
    cursor += len
    node = walker.nextNode() as Text | null
  }
  if (!startNode || !endNode) throw new Error('Could not find text nodes for range')

  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  // jsdom Range doesn't implement getBoundingClientRect; replace with a stub.
  range.getBoundingClientRect = () =>
    ({
      x: 100,
      y: 200,
      top: 200,
      left: 100,
      right: 200,
      bottom: 220,
      width: 100,
      height: 20,
      toJSON() {
        return {}
      },
    }) as DOMRect

  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
  // Fire the event the component listens for.
  document.dispatchEvent(new Event('selectionchange'))
}

describe('CaptionMarkup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.getSelection()?.removeAllRanges()
  })

  it('shows the floating Comment button when text is selected', () => {
    const { container } = render(
      <CaptionMarkup
        caption="Welcome to brunch at our new patio."
        existingPins={[]}
        onPinClick={() => {}}
        onCreatePin={() => {}}
      />,
    )

    // Initially no button.
    expect(
      screen.queryByTestId('caption-markup-comment-button'),
    ).not.toBeInTheDocument()

    act(() => {
      selectRange(container as HTMLElement, 11, 17) // "brunch"
    })

    expect(
      screen.getByTestId('caption-markup-comment-button'),
    ).toBeInTheDocument()
  })

  it('calls onCreatePin with correct char offsets when Comment is clicked', async () => {
    const onCreatePin = vi.fn()
    const user = userEvent.setup()

    const { container } = render(
      <CaptionMarkup
        caption="Welcome to brunch at our new patio."
        existingPins={[]}
        onPinClick={() => {}}
        onCreatePin={onCreatePin}
      />,
    )

    act(() => {
      selectRange(container as HTMLElement, 11, 17) // "brunch" -> from=11, to=17
    })

    const btn = screen.getByTestId('caption-markup-comment-button')
    await user.click(btn)

    expect(onCreatePin).toHaveBeenCalledTimes(1)
    expect(onCreatePin).toHaveBeenCalledWith(11, 17)
  })

  it('hides the Comment button when selection collapses', () => {
    const { container } = render(
      <CaptionMarkup
        caption="Welcome to brunch at our new patio."
        existingPins={[]}
        onPinClick={() => {}}
        onCreatePin={() => {}}
      />,
    )

    act(() => {
      selectRange(container as HTMLElement, 11, 17)
    })
    expect(
      screen.getByTestId('caption-markup-comment-button'),
    ).toBeInTheDocument()

    act(() => {
      const sel = window.getSelection()!
      sel.removeAllRanges()
      document.dispatchEvent(new Event('selectionchange'))
    })

    expect(
      screen.queryByTestId('caption-markup-comment-button'),
    ).not.toBeInTheDocument()
  })
})
