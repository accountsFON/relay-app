import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BulkMediaTray } from '@/components/posts/bulk-media-tray'

/**
 * Mock the @vercel/blob/client upload() so tests don't reach out over the
 * network. Returns a deterministic URL per filename so assertions can verify
 * which file went to which post.
 */
vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(async (pathname: string) => ({
    url: `https://stub.blob.test/${pathname}`,
    pathname,
    contentType: 'image/jpeg',
    contentDisposition: '',
    downloadUrl: `https://stub.blob.test/${pathname}`,
  })),
}))

/**
 * fetch mock that returns:
 *   POST /api/media/upload      → { url: '<token>', blobUrl: '<prefix>' }
 *   POST /api/posts/[id]/media  → echoes back the body so we can inspect it
 */
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : (input as URL).toString()
  if (url === '/api/media/upload') {
    return new Response(
      JSON.stringify({
        url: 'stub-token',
        blobUrl: 'https://stub.blob.test/prefix',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (url.startsWith('/api/posts/') && url.endsWith('/media')) {
    return new Response(init?.body ?? '{}', { status: 200 })
  }
  return new Response('{}', { status: 404 })
})

beforeEach(() => {
  fetchMock.mockClear()
  ;(globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock
})

const day = (mm: number, dd: number): Date =>
  new Date(Date.UTC(2026, mm - 1, dd))

const posts = [
  { id: 'p-may10', postDate: day(5, 10), caption: 'May 10 caption' },
  { id: 'p-may12', postDate: day(5, 12), caption: 'May 12 caption' },
  { id: 'p-may15', postDate: day(5, 15), caption: 'May 15 caption' },
]

/**
 * Helper: build a DataTransfer-shaped object for the synthetic drop event.
 * jsdom does not implement DataTransfer fully, so we provide just the
 * surface our component reads.
 */
function dataTransferWithFiles(files: File[]) {
  return {
    files,
    types: ['Files'],
    getData: vi.fn(),
    setData: vi.fn(),
  }
}

describe('BulkMediaTray', () => {
  it('drop assigns by filename when matching', async () => {
    const onApplied = vi.fn()
    render(
      <BulkMediaTray batchId="b1" posts={posts} onApplied={onApplied} />,
    )

    const file = new File(['x'], '05-12.jpg', { type: 'image/jpeg' })
    const dropZone = screen.getByTestId('bulk-media-dropzone')

    fireEvent.drop(dropZone, {
      dataTransfer: dataTransferWithFiles([file]),
    })

    // Wait for the upload + match to settle.
    await waitFor(() => {
      expect(
        screen.getByTestId('bulk-media-slot-assigned-p-may12'),
      ).toBeInTheDocument()
    })
  })

  it('manual drag-assign works for unmatched files', async () => {
    const onApplied = vi.fn()
    render(
      <BulkMediaTray batchId="b1" posts={posts} onApplied={onApplied} />,
    )

    const file = new File(['x'], 'random.jpg', { type: 'image/jpeg' })
    const dropZone = screen.getByTestId('bulk-media-dropzone')

    fireEvent.drop(dropZone, {
      dataTransfer: dataTransferWithFiles([file]),
    })

    // Lands in unassigned first.
    await waitFor(() => {
      expect(
        screen.getByTestId('bulk-media-unassigned-item-random.jpg'),
      ).toBeInTheDocument()
    })

    // Now manually drag it to the May 15 slot. We simulate by firing a drop
    // on the slot with a DataTransfer that returns the unassigned file's id.
    const item = screen.getByTestId('bulk-media-unassigned-item-random.jpg')
    // The component sets the file id in onDragStart via setData. We don't
    // actually call setData here (jsdom limit); instead we read the
    // component's internal id by triggering dragstart and capturing the
    // setData call through a fake DataTransfer.
    let capturedFileId: string | null = null
    const dragStartDT = {
      setData: (type: string, value: string) => {
        if (type === 'text/plain') capturedFileId = value
      },
      effectAllowed: '',
    }
    fireEvent.dragStart(item, { dataTransfer: dragStartDT })
    expect(capturedFileId).toBeTruthy()

    const slot = screen.getByTestId('bulk-media-slot-p-may15')
    const dropDT = {
      types: ['text/plain'],
      getData: (type: string) =>
        type === 'text/plain' ? capturedFileId ?? '' : '',
    }
    fireEvent.drop(slot, { dataTransfer: dropDT })

    await waitFor(() => {
      expect(
        screen.getByTestId('bulk-media-slot-assigned-p-may15'),
      ).toBeInTheDocument()
    })
  })

  it('unmatched files surface in the unassigned zone', async () => {
    const onApplied = vi.fn()
    render(
      <BulkMediaTray batchId="b1" posts={posts} onApplied={onApplied} />,
    )

    const file = new File(['x'], 'mystery.png', { type: 'image/png' })
    const dropZone = screen.getByTestId('bulk-media-dropzone')

    fireEvent.drop(dropZone, {
      dataTransfer: dataTransferWithFiles([file]),
    })

    await waitFor(() => {
      const zone = screen.getByTestId('bulk-media-unassigned')
      expect(zone).toBeInTheDocument()
      expect(zone.textContent).toContain('mystery.png')
    })
    // No slot should have an assignment yet.
    for (const p of posts) {
      expect(
        screen.queryByTestId(`bulk-media-slot-assigned-${p.id}`),
      ).toBeNull()
    }
  })

  it('Apply commits all assignments via /api/posts/[id]/media', async () => {
    const onApplied = vi.fn()
    render(
      <BulkMediaTray batchId="b1" posts={posts} onApplied={onApplied} />,
    )

    // Drop two files that auto-match (05-10 and 05-15).
    const f1 = new File(['x'], '05-10.jpg', { type: 'image/jpeg' })
    const f2 = new File(['x'], '05-15.jpg', { type: 'image/jpeg' })
    const dropZone = screen.getByTestId('bulk-media-dropzone')
    fireEvent.drop(dropZone, {
      dataTransfer: dataTransferWithFiles([f1, f2]),
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('bulk-media-slot-assigned-p-may10'),
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('bulk-media-slot-assigned-p-may15'),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('bulk-media-apply'))

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled()
    })

    // Two persist calls (Apply commits both assignments). Token request is
    // handled by the @vercel/blob/client.upload() SDK which we mock above,
    // so no /api/media/upload calls hit fetchMock.
    const persistCalls = fetchMock.mock.calls.filter(([url]) => {
      const u = typeof url === 'string' ? url : (url as URL).toString()
      return u.startsWith('/api/posts/') && u.endsWith('/media')
    })
    expect(persistCalls).toHaveLength(2)
    const targetIds = persistCalls
      .map(([url]) => {
        const u = typeof url === 'string' ? url : (url as URL).toString()
        const match = u.match(/\/api\/posts\/([^/]+)\/media/)
        return match?.[1]
      })
      .sort()
    expect(targetIds).toEqual(['p-may10', 'p-may15'])
  })
})
