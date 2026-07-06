// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { usePostImageReplace } from '@/components/preview/post-image-replace'

const replaceMock = vi.fn()
vi.mock('@/components/posts/use-replace-post-image', () => ({
  useReplacePostImage: () => ({ replace: replaceMock, isPending: false, error: null }),
}))

function Harness() {
  const { dragProps, overlay } = usePostImageReplace({ postId: 'post_1' })
  return (
    <div data-testid="container" {...dragProps}>
      <img alt="" />
      {overlay}
    </div>
  )
}

beforeEach(() => vi.clearAllMocks())

describe('usePostImageReplace', () => {
  it('replaces on drop onto the container (both roles)', () => {
    render(<Harness />)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    fireEvent.drop(screen.getByTestId('container'), { dataTransfer: { files: [file] } })
    expect(replaceMock).toHaveBeenCalledWith(file)
  })

  it('renders a corner Replace button that opens the file picker', () => {
    render(<Harness />)
    expect(screen.getByTestId('post-image-replace-button')).toBeInTheDocument()
    expect(screen.queryByTestId('post-image-pick')).not.toBeInTheDocument()
  })

  it('shows the drag-over overlay only while dragging', () => {
    render(<Harness />)
    const container = screen.getByTestId('container')
    expect(screen.queryByTestId('post-image-drop-overlay')).not.toBeInTheDocument()
    fireEvent.dragOver(container)
    expect(screen.getByTestId('post-image-drop-overlay')).toBeInTheDocument()
    fireEvent.dragLeave(container)
    expect(screen.queryByTestId('post-image-drop-overlay')).not.toBeInTheDocument()
  })
})
