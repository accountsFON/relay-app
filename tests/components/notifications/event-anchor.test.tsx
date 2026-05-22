import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { EventAnchor } from '@/components/notifications/event-anchor'

describe('EventAnchor', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView =
      scrollIntoViewMock as unknown as Element['scrollIntoView']
    window.history.replaceState({}, '', '/')
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    } else {
      // jsdom doesn't define matchMedia by default; remove any test override.
      delete (window as unknown as { matchMedia?: unknown }).matchMedia
    }
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

  it('respects prefers-reduced-motion by scrolling with behavior: auto', async () => {
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }))
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaMock,
    })
    window.history.replaceState({}, '', '/somewhere#comment-e1')
    document.body.innerHTML = '<div data-event-id="e1">target</div>'
    render(<EventAnchor />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(matchMediaMock).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(scrollIntoViewMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto', block: 'center' }),
    )
  })

  it('escapes the eventId via CSS.escape before querySelector', async () => {
    const escapeSpy = vi.spyOn(CSS, 'escape')
    window.history.replaceState({}, '', '/somewhere#comment-e1')
    document.body.innerHTML = '<div data-event-id="e1">target</div>'
    render(<EventAnchor />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(escapeSpy).toHaveBeenCalledWith('e1')
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
    escapeSpy.mockRestore()
  })
})
