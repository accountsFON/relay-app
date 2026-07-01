import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'

vi.mock('@/server/actions/generate-content', () => ({
  generateContentAction: vi.fn(),
}))
vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/app/(app)/clients/[id]/generate/actions', () => ({
  getClientCrawlInfo: async () => ({ autoCrawl: 'never', hasCrawledData: false, crawledDataAt: null }),
}))

import { generateContentAction } from '@/server/actions/generate-content'
const mockAction = generateContentAction as unknown as ReturnType<typeof vi.fn>

beforeEach(() => mockAction.mockReset())

/** Open the dialog AND tick the monthly-confirm box so Start generation is enabled. */
async function openDialog() {
  render(<GenerateContentDialog clientId="c1" targetMonth="2026-05" />)
  fireEvent.click(screen.getByRole('button', { name: /generate content/i }))
  // tick monthly-confirm so the Start generation button is enabled
  await act(async () => {
    fireEvent.click(screen.getByLabelText(/updated for this client this month/i))
  })
}

describe('GenerateContentDialog', () => {
  it('renders the picker view on open', async () => {
    await openDialog()
    expect(await screen.findByLabelText(/^month$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/recrawl/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start generation/i })).toBeInTheDocument()
  })

  it('on Generate, no_match probe transitions to firing then closes', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'no_match' })
    mockAction.mockResolvedValueOnce({ kind: 'fired', runId: 'r1' })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(2))
    const calls = mockAction.mock.calls
    expect(calls[0][0]).toMatchObject({ kind: 'probe' })
    expect(calls[1][0]).toMatchObject({ kind: 'fire', targetBatchId: null })
  })

  it('on Generate, empty_batch probe auto-fires with targetBatchId: null (server resolves)', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'empty_batch', batchId: 'b1', label: 'May 2026' })
    mockAction.mockResolvedValueOnce({ kind: 'fired', runId: 'r1' })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(2))
    expect(mockAction.mock.calls[1][0]).toMatchObject({ kind: 'fire', targetBatchId: null })
  })

  it('on Generate, needs_confirm probe shows confirm view', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'needs_confirm', batchId: 'b1', label: 'May 2026', postCount: 12 })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    expect(await screen.findByText(/replace/i)).toBeInTheDocument()
    expect(screen.getByText(/12 post/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^replace$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('confirm Cancel returns to picker preserving the month', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'needs_confirm', batchId: 'b1', label: 'May 2026', postCount: 12 })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    await screen.findByRole('button', { name: /^replace$/i })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(await screen.findByLabelText(/^month$/i)).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>(/^month$/i).value).toBe('2026-05')
  })

  it('confirm Replace calls fire with targetBatchId set', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'needs_confirm', batchId: 'b1', label: 'May 2026', postCount: 12 })
    mockAction.mockResolvedValueOnce({ kind: 'fired', runId: 'r1' })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    await screen.findByRole('button', { name: /^replace$/i })
    fireEvent.click(screen.getByRole('button', { name: /^replace$/i }))
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(2))
    expect(mockAction.mock.calls[1][0]).toMatchObject({
      kind: 'fire',
      targetBatchId: 'b1',
    })
  })

  it('drift response returns to confirm with refreshed state', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'needs_confirm', batchId: 'b1', label: 'May 2026', postCount: 12 })
    mockAction.mockResolvedValueOnce({ kind: 'drift', current: { batchId: 'b2', label: 'May 2026', postCount: 7 } })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    await screen.findByText(/12 post/i)
    fireEvent.click(screen.getByRole('button', { name: /^replace$/i }))
    expect(await screen.findByText(/7 post/i)).toBeInTheDocument()
  })

  it('error response shows error view with Retry', async () => {
    mockAction.mockResolvedValueOnce({ kind: 'error', message: 'Network down' })
    await openDialog()
    fireEvent.click(screen.getByRole('button', { name: /start generation/i }))
    expect(await screen.findByText(/network down/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('GenerateContentDialog — onboarding gate', () => {
  it('renders a disabled button with the reason and does not open the dialog', () => {
    render(<GenerateContentDialog clientId="c1" targetMonth="2026-08" disabled disabledReason="Complete onboarding first" />)
    const btn = screen.getByRole('button', { name: /generate content/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', 'Complete onboarding first')
    fireEvent.click(btn)
    expect(screen.queryByText(/start generation/i)).not.toBeInTheDocument()
  })
})

describe('GenerateContentDialog — monthly confirmation', () => {
  it('disables Start generation until the monthly-confirm box is ticked', async () => {
    render(<GenerateContentDialog clientId="c1" targetMonth="2026-08" />)
    fireEvent.click(screen.getByRole('button', { name: /generate content/i }))
    const start = screen.getByRole('button', { name: /start generation/i })
    expect(start).toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/updated for this client this month/i))
    })
    expect(screen.getByRole('button', { name: /start generation/i })).toBeEnabled()
  })
})
