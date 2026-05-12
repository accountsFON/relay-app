import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GenerateContentDialog } from '@/components/relay/generate-content-dialog'

const triggerGenerationMock = vi.fn()
const getRunStatusMock = vi.fn()
const getClientCrawlInfoMock = vi.fn()
const finalizePostGenerationActionMock = vi.fn()
const findMatchingBatchForRunActionMock = vi.fn()
const deferFinalizeActionMock = vi.fn()
const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('@/app/(app)/clients/[id]/generate/actions', () => ({
  triggerGeneration: (...args: unknown[]) => triggerGenerationMock(...args),
  getRunStatus: (...args: unknown[]) => getRunStatusMock(...args),
  getClientCrawlInfo: (...args: unknown[]) => getClientCrawlInfoMock(...args),
}))

vi.mock('@/server/actions/finalize-post-generation', () => ({
  finalizePostGenerationAction: (...args: unknown[]) =>
    finalizePostGenerationActionMock(...args),
  findMatchingBatchForRunAction: (...args: unknown[]) =>
    findMatchingBatchForRunActionMock(...args),
  deferFinalizeAction: (...args: unknown[]) => deferFinalizeActionMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

describe('GenerateContentDialog', () => {
  beforeEach(() => {
    triggerGenerationMock.mockReset()
    getRunStatusMock.mockReset()
    getClientCrawlInfoMock.mockReset().mockResolvedValue({
      autoCrawl: 'when_empty',
      hasCrawledData: true,
      crawledDataAt: null,
    })
    finalizePostGenerationActionMock.mockReset()
    findMatchingBatchForRunActionMock.mockReset()
    deferFinalizeActionMock.mockReset()
    pushMock.mockReset()
    refreshMock.mockReset()
  })

  it('shows the Run in background button only while pipeline is running', async () => {
    const user = userEvent.setup()
    triggerGenerationMock.mockResolvedValue({ contentRunId: 'run-1' })
    render(<GenerateContentDialog clientId="client-1" clientName="Test Client" targetMonth="2026-05" />)
    await user.click(screen.getByRole('button', { name: /generate content/i }))
    await user.click(screen.getByRole('button', { name: /start generation/i }))
    expect(
      await screen.findByRole('button', { name: /run in background/i }),
    ).toBeInTheDocument()
  })

  it('calls deferFinalizeAction when Run in background is clicked', async () => {
    const user = userEvent.setup()
    triggerGenerationMock.mockResolvedValue({ contentRunId: 'run-1' })
    deferFinalizeActionMock.mockResolvedValue(undefined)
    render(<GenerateContentDialog clientId="client-1" clientName="Test Client" targetMonth="2026-05" />)
    await user.click(screen.getByRole('button', { name: /generate content/i }))
    await user.click(screen.getByRole('button', { name: /start generation/i }))
    const bgButton = await screen.findByRole('button', {
      name: /run in background/i,
    })
    await user.click(bgButton)
    await waitFor(() => {
      expect(deferFinalizeActionMock).toHaveBeenCalledWith('run-1')
    })
  })
})
