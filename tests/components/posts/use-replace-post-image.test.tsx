// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useReplacePostImage } from '@/components/posts/use-replace-post-image'

const uploadMock = vi.fn()
vi.mock('@vercel/blob/client', () => ({ upload: (...a: unknown[]) => uploadMock(...a) }))
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

beforeEach(() => {
  vi.clearAllMocks()
  uploadMock.mockResolvedValue({ url: 'https://blob/new.png' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }))
})

describe('useReplacePostImage', () => {
  it('uploads with the postId payload, persists the url, refreshes, and fires onUploaded', async () => {
    const onUploaded = vi.fn()
    const { result } = renderHook(() => useReplacePostImage('post_1', { onUploaded }))
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    act(() => result.current.replace(file))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://blob/new.png'))
    expect(uploadMock).toHaveBeenCalledWith('a.png', file, expect.objectContaining({ handleUploadUrl: '/api/media/upload', clientPayload: 'post_1' }))
    expect(fetch).toHaveBeenCalledWith('/api/posts/post_1/media', expect.objectContaining({ method: 'POST' }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('surfaces an error when the persist request fails', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, text: async () => 'nope' })
    const { result } = renderHook(() => useReplacePostImage('post_1'))
    act(() => result.current.replace(new File(['x'], 'a.png', { type: 'image/png' })))
    await waitFor(() => expect(result.current.error).toMatch(/nope/i))
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
