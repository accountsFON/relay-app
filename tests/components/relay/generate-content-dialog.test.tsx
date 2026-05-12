import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'

const triggerGenerationMock = vi.fn()
const getClientCrawlInfoMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/app/(app)/clients/[id]/generate/actions', () => ({
  triggerGeneration: (...args: unknown[]) => triggerGenerationMock(...args),
  getClientCrawlInfo: (...args: unknown[]) => getClientCrawlInfoMock(...args),
}))

vi.mock('@/components/relay/in-flight-runs-provider', () => ({
  useInFlightRuns: () => ({
    runs: [],
    isLoading: false,
    error: null,
    refresh: refreshMock,
  }),
}))

const defaultProps = {
  clientId: 'client-1',
  clientName: 'Test Client',
  targetMonth: '2026-05',
}

describe('GenerateContentDialog', () => {
  beforeEach(() => {
    triggerGenerationMock.mockReset()
    getClientCrawlInfoMock.mockReset().mockResolvedValue({
      autoCrawl: 'when_empty',
      hasCrawledData: true,
      crawledDataAt: null,
    })
    refreshMock.mockReset().mockResolvedValue(undefined)
  })

  it('opens the dialog when the trigger button is clicked', async () => {
    const user = userEvent.setup()
    render(<GenerateContentDialog {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /generate content/i }))
    expect(screen.getByRole('button', { name: /start generation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls triggerGeneration, refresh, and closes the dialog on success', async () => {
    const user = userEvent.setup()
    triggerGenerationMock.mockResolvedValue(undefined)
    render(<GenerateContentDialog {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /generate content/i }))
    await user.click(screen.getByRole('button', { name: /start generation/i }))

    await waitFor(() => {
      expect(triggerGenerationMock).toHaveBeenCalledWith('client-1', '2026-05', expect.any(Boolean))
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })

    // Dialog should close (Start generation button gone)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /start generation/i })).not.toBeInTheDocument()
    })
  })

  it('shows an inline error and does not close when triggerGeneration throws', async () => {
    const user = userEvent.setup()
    triggerGenerationMock.mockRejectedValue(new Error('quota exceeded'))
    render(<GenerateContentDialog {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /generate content/i }))
    await user.click(screen.getByRole('button', { name: /start generation/i }))

    expect(await screen.findByText(/quota exceeded/i)).toBeInTheDocument()
    // Dialog remains open
    expect(screen.getByRole('button', { name: /start generation/i })).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('disables the month picker when lockMonth is true', async () => {
    const user = userEvent.setup()
    render(<GenerateContentDialog {...defaultProps} lockMonth />)

    await user.click(screen.getByRole('button', { name: /generate content/i }))

    expect(screen.queryByLabelText(/month/i)).not.toBeInTheDocument()
    expect(screen.getByText(/locked to this relay/i)).toBeInTheDocument()
  })
})
