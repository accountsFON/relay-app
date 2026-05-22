import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MediaUpload } from '@/components/posts/media-upload'

vi.mock('@vercel/blob/client', () => ({
  upload: vi.fn(),
}))

describe('MediaUpload remove button', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('renders the remove button when an image is present', () => {
    render(
      <MediaUpload
        postId="p1"
        currentMediaUrl="https://blob.example/img.jpg"
        onUploaded={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button', { name: /Remove image/i })
    expect(btn).toBeInTheDocument()
  })

  it('keeps the remove button visible by default (no hover-only)', () => {
    render(
      <MediaUpload
        postId="p1"
        currentMediaUrl="https://blob.example/img.jpg"
        onUploaded={vi.fn()}
      />,
    )
    const btn = screen.getByTestId('media-upload-remove')
    // Tailwind classes: opacity-80 default, group-hover:opacity-100 on hover,
    // focus-visible:opacity-100 on keyboard focus. The default must not be
    // opacity-0 (the prior touch-broken state).
    expect(btn.className).toContain('opacity-80')
    expect(btn.className).not.toMatch(/\bopacity-0\b/)
  })

  it('POSTs an empty url to clear the media when the remove button is clicked', async () => {
    const onUploaded = vi.fn()
    render(
      <MediaUpload
        postId="p1"
        currentMediaUrl="https://blob.example/img.jpg"
        onUploaded={onUploaded}
      />,
    )
    const btn = screen.getByRole('button', { name: /Remove image/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/posts/p1/media',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: '' }),
        }),
      )
    })
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith('')
    })
  })
})
