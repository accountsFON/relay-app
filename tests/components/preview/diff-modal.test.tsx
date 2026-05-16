import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiffModal } from '@/components/preview/diff-modal'
import type { DiffSegment } from '@/lib/text-diff'

const sampleDiff: DiffSegment[] = [
  { type: 'equal', text: 'Welcome to our new ' },
  { type: 'delete', text: 'patio space' },
  { type: 'insert', text: 'outdoor seating area' },
  { type: 'equal', text: '.' },
]

describe('DiffModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the diff with insert / delete / equal segments', () => {
    render(
      <DiffModal
        postId="post-1"
        threadId="thread-1"
        originalCaption="Welcome to our new patio space."
        proposedCaption="Welcome to our new outdoor seating area."
        diff={sampleDiff}
      />,
    )

    const equals = screen.getAllByTestId('diff-modal-segment-equal')
    const deletes = screen.getAllByTestId('diff-modal-segment-delete')
    const inserts = screen.getAllByTestId('diff-modal-segment-insert')
    expect(equals).toHaveLength(2)
    expect(deletes).toHaveLength(1)
    expect(inserts).toHaveLength(1)
    expect(deletes[0]).toHaveTextContent('patio space')
    expect(inserts[0]).toHaveTextContent('outdoor seating area')
  })

  it('Edit toggle reveals an editable textarea pre-filled with the proposal', async () => {
    const user = userEvent.setup()
    render(
      <DiffModal
        postId="post-1"
        threadId="thread-1"
        originalCaption="Welcome to our new patio space."
        proposedCaption="Welcome to our new outdoor seating area."
        diff={sampleDiff}
      />,
    )

    expect(screen.queryByTestId('diff-modal-editor')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('diff-modal-edit'))

    const editor = await screen.findByTestId('diff-modal-editor')
    expect(editor).toBeInTheDocument()
    expect((editor as HTMLTextAreaElement).value).toBe(
      'Welcome to our new outdoor seating area.',
    )
  })

  it('Accept POSTs to /accept then calls onAccepted and onClose', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ postVersionId: 'pv-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const onAccepted = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DiffModal
        postId="post-7"
        threadId="thread-42"
        originalCaption="old"
        proposedCaption="new caption"
        diff={[{ type: 'insert', text: 'new caption' }]}
        onAccepted={onAccepted}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByTestId('diff-modal-accept'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/posts/post-7/fix-with-ai/accept')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      threadId: 'thread-42',
      proposedCaption: 'new caption',
    })
    await waitFor(() => {
      expect(onAccepted).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('Reject closes the modal without calling the accept API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onAccepted = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DiffModal
        postId="post-1"
        threadId="thread-1"
        originalCaption="x"
        proposedCaption="y"
        diff={sampleDiff}
        onAccepted={onAccepted}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByTestId('diff-modal-reject'))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onAccepted).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
