import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useEffect } from 'react'

const { markMentionReadActionMock } = vi.hoisted(() => ({
  markMentionReadActionMock: vi.fn(),
}))

vi.mock('@/app/(app)/clients/[id]/activity/actions', () => ({
  markMentionReadAction: markMentionReadActionMock,
}))

import {
  NotificationProvider,
  useNotifications,
} from '@/components/notifications/notification-provider'

const SAMPLE_SUMMARY = {
  count: 2,
  items: [
    {
      eventId: 'e1',
      mentionId: 'm1',
      kind: 'batch_passed',
      summary: 'A passed B',
      href: '/x',
      createdAt: new Date().toISOString(),
      runId: null,
    },
    {
      eventId: 'e2',
      mentionId: 'm2',
      kind: 'comment',
      summary: 'C said hi',
      href: '/y',
      createdAt: new Date().toISOString(),
      runId: null,
    },
  ],
}

function Probe({ onState }: { onState: (s: ReturnType<typeof useNotifications>) => void }) {
  const ctx = useNotifications()
  useEffect(() => {
    onState(ctx)
  }, [ctx, onState])
  return null
}

// Drain microtasks under fake timers without advancing wall time. `fetch().then(r => r.json())`
// resolves through multiple microtask ticks; React state commits also schedule microtasks.
// Multiple Promise.resolve() flushes inside an `act` cover it without touching the interval.
async function flushMicrotasks(ticks = 10) {
  await act(async () => {
    for (let i = 0; i < ticks; i++) {
      await Promise.resolve()
    }
  })
}

describe('NotificationProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  let visibilityState: 'visible' | 'hidden' = 'visible'

  beforeEach(() => {
    vi.useFakeTimers()
    markMentionReadActionMock.mockReset()
    markMentionReadActionMock.mockResolvedValue(undefined)
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SAMPLE_SUMMARY), { status: 200 }),
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    fetchSpy.mockRestore()
    visibilityState = 'visible'
  })

  it('fires an immediate fetch on mount when tab is visible', async () => {
    const states: ReturnType<typeof useNotifications>[] = []
    render(
      <NotificationProvider>
        <Probe onState={(s) => states.push(s)} />
      </NotificationProvider>,
    )
    await flushMicrotasks()
    expect(fetchSpy).toHaveBeenCalledWith('/api/notifications/summary')
    const last = states[states.length - 1]
    expect(last.count).toBe(2)
    expect(last.items).toHaveLength(2)
  })

  it('polls every 20s while visible', async () => {
    render(
      <NotificationProvider>
        <Probe onState={() => {}} />
      </NotificationProvider>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    await act(async () => {
      vi.advanceTimersByTime(20_000)
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('skips fetch when tab is hidden', async () => {
    visibilityState = 'hidden'
    render(
      <NotificationProvider>
        <Probe onState={() => {}} />
      </NotificationProvider>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(0)
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(0)
  })

  it('fires an immediate fetch on visibilitychange to visible', async () => {
    visibilityState = 'hidden'
    render(
      <NotificationProvider>
        <Probe onState={() => {}} />
      </NotificationProvider>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(0)
    visibilityState = 'visible'
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('markRead optimistically removes the item and decrements count', async () => {
    let lastCtx = null as ReturnType<typeof useNotifications> | null
    render(
      <NotificationProvider>
        <Probe onState={(s) => {
          lastCtx = s
        }} />
      </NotificationProvider>,
    )
    await flushMicrotasks()
    expect(lastCtx?.count).toBe(2)
    await act(async () => {
      await lastCtx!.markRead('e1')
    })
    expect(lastCtx!.items.find((i) => i.eventId === 'e1')).toBeUndefined()
    expect(lastCtx!.count).toBe(1)
    expect(markMentionReadActionMock).toHaveBeenCalledWith('m1')
  })

  it('sets error state when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('offline'))
    let lastCtx = null as ReturnType<typeof useNotifications> | null
    render(
      <NotificationProvider>
        <Probe onState={(s) => {
          lastCtx = s
        }} />
      </NotificationProvider>,
    )
    await flushMicrotasks()
    expect(lastCtx?.error).toBe('offline')
  })

  it('stops polling on 401 and sets unauthorized error', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    )
    let lastCtx = null as ReturnType<typeof useNotifications> | null
    render(
      <NotificationProvider>
        <Probe onState={(s) => {
          lastCtx = s
        }} />
      </NotificationProvider>,
    )
    await flushMicrotasks()
    expect(lastCtx?.error).toBe('unauthorized')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // Advance 60s. No further fetches should fire -- interval was cleared.
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
