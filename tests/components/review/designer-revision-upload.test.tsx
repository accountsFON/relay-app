import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { DesignerRevisionUpload } from '@/components/review/designer-revision-upload'
import { upload } from '@vercel/blob/client'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }))

type UploadResult = Awaited<ReturnType<typeof upload>>

describe('DesignerRevisionUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    refresh.mockClear()
    vi.mocked(upload).mockReset()
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('labels the control "Upload revised image" when the post has no media', () => {
    render(<DesignerRevisionUpload postId="p1" />)
    expect(screen.getByTestId('designer-revision-button-p1')).toHaveTextContent(
      'Upload revised image',
    )
  })

  it('labels the control "Replace image" and shows the current image when media exists', () => {
    render(
      <DesignerRevisionUpload
        postId="p1"
        currentMediaUrl="https://blob.example/img.jpg"
      />,
    )
    expect(screen.getByTestId('designer-revision-button-p1')).toHaveTextContent(
      'Replace image',
    )
    const img = screen.getByAltText('Current post media')
    expect(img).toHaveAttribute('src', 'https://blob.example/img.jpg')
  })

  it('uploads the file, POSTs the url to the media route, and refreshes on success', async () => {
    vi.mocked(upload).mockResolvedValue(
      { url: 'https://blob.example/new.jpg' } as unknown as UploadResult,
    )
    render(<DesignerRevisionUpload postId="p1" />)

    const input = screen.getByTestId('designer-revision-input-p1')
    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(upload).toHaveBeenCalledWith(
        'new.jpg',
        file,
        expect.objectContaining({
          access: 'public',
          handleUploadUrl: '/api/media/upload',
          clientPayload: 'p1',
        }),
      )
    })
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/posts/p1/media',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://blob.example/new.jpg' }),
        }),
      )
    })
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it('surfaces an error and does not refresh when the persist step fails', async () => {
    vi.mocked(upload).mockResolvedValue(
      { url: 'https://blob.example/new.jpg' } as unknown as UploadResult,
    )
    fetchSpy.mockResolvedValue(new Response('nope', { status: 409 }))
    render(<DesignerRevisionUpload postId="p1" />)

    const input = screen.getByTestId('designer-revision-input-p1')
    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    await waitFor(() => {
      expect(screen.getByTestId('designer-revision-error-p1')).toBeInTheDocument()
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
