import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FixWithAIButton } from '@/components/preview/fix-with-ai-button'

describe('FixWithAIButton', () => {
  beforeEach(() => {
    // Default: no fetch should be called in these visibility tests.
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders on a caption-text thread in internal mode', () => {
    render(
      <FixWithAIButton
        postId="post-1"
        threadId="thread-1"
        pinKind="caption"
        mode="internal"
      />,
    )
    const button = screen.getByTestId('fix-with-ai-button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent(/fix with ai/i)
  })

  it('renders on a post-level thread in internal mode', () => {
    render(
      <FixWithAIButton
        postId="post-1"
        threadId="thread-1"
        pinKind="post"
        mode="internal"
      />,
    )
    expect(screen.getByTestId('fix-with-ai-button')).toBeInTheDocument()
  })

  it('is hidden on image-pinned threads (no image regen in v1)', () => {
    render(
      <FixWithAIButton
        postId="post-1"
        threadId="thread-1"
        pinKind="image"
        mode="internal"
      />,
    )
    expect(screen.queryByTestId('fix-with-ai-button')).not.toBeInTheDocument()
  })

  it('is hidden in review (magic-link) mode regardless of pin kind', () => {
    render(
      <FixWithAIButton
        postId="post-1"
        threadId="thread-1"
        pinKind="caption"
        mode="review"
      />,
    )
    expect(screen.queryByTestId('fix-with-ai-button')).not.toBeInTheDocument()
  })

  it('omits threadId in the request body when used in per-post mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ proposedCaption: 'new', diff: [], tokenUsage: { in: 1, out: 1, costUsd: 0 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<FixWithAIButton postId="post-1" mode="internal" originalCaption="old" />)
    fireEvent.click(screen.getByTestId('fix-with-ai-button'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({})
  })
})
