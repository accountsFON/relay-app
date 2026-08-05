import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

import { useLiveRefresh } from '@/lib/use-live-refresh'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

describe('useLiveRefresh', () => {
  beforeEach(() => {
    refresh.mockClear()
    vi.useFakeTimers()
    setVisibility('visible')
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('does not refresh on mount (the page just server-rendered)', () => {
    renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('polls router.refresh on the interval while the tab is visible', () => {
    renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('does not poll while the tab is hidden', () => {
    renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    refresh.mockClear()
    act(() => {
      vi.advanceTimersByTime(20000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes immediately when the tab becomes visible again', () => {
    renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    setVisibility('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    refresh.mockClear()
    setVisibility('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes on window focus (clicking back into the tab)', () => {
    renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops polling and detaches listeners after unmount', () => {
    const { unmount } = renderHook(() => useLiveRefresh({ intervalMs: 5000 }))
    unmount()
    refresh.mockClear()
    act(() => {
      vi.advanceTimersByTime(20000)
      window.dispatchEvent(new Event('focus'))
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    renderHook(() => useLiveRefresh({ enabled: false, intervalMs: 1000 }))
    act(() => {
      vi.advanceTimersByTime(5000)
      window.dispatchEvent(new Event('focus'))
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
