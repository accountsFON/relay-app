import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '@/hooks/use-is-mobile'

type Listener = (e: MediaQueryListEvent) => void

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<Listener>()
  const mql = {
    get matches() {
      return matches
    },
    media: '(max-width: 767px)',
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    // legacy API, unused but present for completeness
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
    dispatchEvent: () => true,
  }
  const matchMedia = vi.fn(() => mql as unknown as MediaQueryList)
  vi.stubGlobal('matchMedia', matchMedia)
  // jsdom attaches matchMedia to window; stubGlobal covers both.
  return {
    matchMedia,
    setMatches: (next: boolean) => {
      matches = next
      for (const cb of listeners) cb({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when the media query matches on mount', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when the media query does not match', () => {
    installMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when the media query change event fires', () => {
    const mm = installMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => mm.setMatches(true))
    expect(result.current).toBe(true)

    act(() => mm.setMatches(false))
    expect(result.current).toBe(false)
  })

  it('unsubscribes from the change event on unmount', () => {
    const mm = installMatchMedia(true)
    const { unmount } = renderHook(() => useIsMobile())
    expect(mm.listenerCount()).toBe(1)
    unmount()
    expect(mm.listenerCount()).toBe(0)
  })
})
