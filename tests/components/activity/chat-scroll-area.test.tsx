import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { ChatScrollArea } from '@/components/activity/chat-scroll-area'

// jsdom does no layout, so scrollHeight is 0 and scrollTop is not meaningfully
// stored. Install deterministic, tracked implementations on the prototype so we
// can assert the auto-scroll behavior, then restore them after the file runs.
let scrollTopValue = 0
let savedScrollHeight: PropertyDescriptor | undefined
let savedScrollTop: PropertyDescriptor | undefined

beforeAll(() => {
  savedScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
  savedScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop')
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return 1000
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return scrollTopValue
    },
    set(v: number) {
      scrollTopValue = v
    },
  })
})

afterAll(() => {
  if (savedScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', savedScrollHeight)
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  if (savedScrollTop) Object.defineProperty(HTMLElement.prototype, 'scrollTop', savedScrollTop)
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollTop
})

beforeEach(() => {
  scrollTopValue = 0
})

function area(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-component="chat-scroll-area"]') as HTMLElement
}

describe('ChatScrollArea', () => {
  it('scrolls to the bottom on mount', () => {
    const { container } = render(
      <ChatScrollArea scrollKey="a">
        <div>messages</div>
      </ChatScrollArea>,
    )
    expect(area(container).scrollTop).toBe(1000)
  })

  it('scrolls to the bottom again when scrollKey changes (new message)', () => {
    const { container, rerender } = render(
      <ChatScrollArea scrollKey="a">
        <div>messages</div>
      </ChatScrollArea>,
    )
    scrollTopValue = 0 // simulate the user scrolling up to read history
    rerender(
      <ChatScrollArea scrollKey="b">
        <div>messages</div>
      </ChatScrollArea>,
    )
    expect(area(container).scrollTop).toBe(1000)
  })

  it('does not force-scroll when scrollKey is unchanged across a re-render', () => {
    const { container, rerender } = render(
      <ChatScrollArea scrollKey="a">
        <div>messages</div>
      </ChatScrollArea>,
    )
    scrollTopValue = 0
    rerender(
      <ChatScrollArea scrollKey="a">
        <div>messages and more</div>
      </ChatScrollArea>,
    )
    expect(area(container).scrollTop).toBe(0)
  })
})
