import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ThreadLivePoller } from '@/components/activity/thread-live-poller'

const refreshMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
}

function jsonResponse(latestId: string | null, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ latestId }),
  } as Response
}

describe('ThreadLivePoller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refreshMock.mockReset()
    setVisibility('visible')
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('soft-refreshes when the latest event id changes', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('evt_new'))
    render(<ThreadLivePoller clientId="c1" latestEventId="evt_old" />)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT refresh when the latest id is unchanged', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('evt_same'))
    render(<ThreadLivePoller clientId="c1" latestEventId="evt_same" />)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('only refreshes once per change, not every tick', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('evt_new'))
    render(<ThreadLivePoller clientId="c1" latestEventId="evt_old" />)

    await vi.advanceTimersByTimeAsync(5_000)
    await vi.advanceTimersByTimeAsync(5_000)

    // Second tick still sees evt_new but the baseline was already advanced.
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('skips fetching while the tab is hidden', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse('evt_new'))
    setVisibility('hidden')
    render(<ThreadLivePoller clientId="c1" latestEventId="evt_old" />)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('stops polling after a 401 (dead session)', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(null, 401))
    render(<ThreadLivePoller clientId="c1" latestEventId="x" />)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
