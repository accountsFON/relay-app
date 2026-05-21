import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FailedRunRow } from '@/components/notifications/failed-run-row'

const retryMock = vi.fn()
const dismissMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('@/server/actions/in-flight-runs', () => ({
  retryFailedRunAction: (...args: unknown[]) => retryMock(...args),
  acknowledgeFailedRunAction: (...args: unknown[]) => dismissMock(...args),
}))
vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: () => ({ refresh: refreshMock }),
}))

const markReadMock = vi.fn()
vi.mock('@/components/notifications/notification-provider', () => ({
  useNotifications: () => ({ markRead: markReadMock, closeDropdown: vi.fn() }),
}))

const SAMPLE = {
  eventId: 'e1',
  mentionId: 'm1',
  kind: 'run_failed',
  summary: 'Cedar Creek · June 2026 content generation failed for Cedar Creek.',
  href: '/admin/failed-runs/r1',
  createdAt: new Date().toISOString(),
  runId: 'r1',
}

describe('FailedRunRow', () => {
  beforeEach(() => {
    retryMock.mockReset()
    dismissMock.mockReset()
    refreshMock.mockReset()
    markReadMock.mockReset()
  })

  it('renders summary + Retry + Dismiss buttons', () => {
    render(<FailedRunRow item={SAMPLE} />)
    expect(screen.getByText(/content generation failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Dismiss$/i })).toBeInTheDocument()
  })

  it('Retry: calls action with runId, marks read, refreshes', async () => {
    retryMock.mockResolvedValue({ ok: true })
    render(<FailedRunRow item={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => expect(retryMock).toHaveBeenCalledWith('r1'))
    expect(refreshMock).toHaveBeenCalled()
    expect(markReadMock).toHaveBeenCalledWith('e1')
  })

  it('Retry shows pending state then surfaces error on failure', async () => {
    retryMock.mockRejectedValue(new Error('something broke'))
    render(<FailedRunRow item={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/i }))
    await waitFor(() => expect(screen.getByText(/something broke/)).toBeInTheDocument())
  })

  it('Dismiss: calls acknowledge, marks read, refreshes', async () => {
    dismissMock.mockResolvedValue({ ok: true })
    render(<FailedRunRow item={SAMPLE} />)
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss$/i }))
    await waitFor(() => expect(dismissMock).toHaveBeenCalledWith('r1'))
    expect(markReadMock).toHaveBeenCalledWith('e1')
  })
})
