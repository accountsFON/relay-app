import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { EventAnchor } from '@/components/notifications/event-anchor'

describe('EventAnchor', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView =
      scrollIntoViewMock as unknown as Element['scrollIntoView']
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('scrolls to the element matching #comment-XYZ on mount', async () => {
    window.history.replaceState({}, '', '/somewhere#comment-e1')
    document.body.innerHTML = '<div data-event-id="e1">target</div>'
    render(<EventAnchor />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth', block: 'center' }),
    )
  })

  it('adds and then removes the highlight class', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/somewhere#comment-e1')
    document.body.innerHTML = '<div data-event-id="e1">target</div>'
    render(<EventAnchor />)
    await act(async () => {
      await Promise.resolve()
    })
    const target = document.querySelector('[data-event-id="e1"]') as HTMLElement
    expect(target.classList.contains('bg-cream-warm')).toBe(true)
    await act(async () => {
      vi.advanceTimersByTime(1600)
    })
    expect(target.classList.contains('bg-cream-warm')).toBe(false)
    vi.useRealTimers()
  })

  it('silent no op when the element is not present', async () => {
    window.history.replaceState({}, '', '/somewhere#comment-missing')
    document.body.innerHTML = '<div data-event-id="other">not the target</div>'
    expect(() => render(<EventAnchor />)).not.toThrow()
    await act(async () => {
      await Promise.resolve()
    })
    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('reacts to hashchange events', async () => {
    document.body.innerHTML = '<div data-event-id="e1">target</div>'
    render(<EventAnchor />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(0)
    window.history.replaceState({}, '', '/somewhere#comment-e1')
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
  })
})
