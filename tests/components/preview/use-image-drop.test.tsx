// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useImageDrop } from '@/components/preview/use-image-drop'

function Harness({ onFile }: { onFile: (f: File) => void }) {
  const { isDragging, dragProps } = useImageDrop(onFile)
  return <div data-testid="zone" data-dragging={isDragging} {...dragProps} />
}

describe('useImageDrop', () => {
  it('tracks drag state and passes the first dropped file', () => {
    const onFile = vi.fn()
    const { getByTestId } = render(<Harness onFile={onFile} />)
    const zone = getByTestId('zone')
    fireEvent.dragOver(zone)
    expect(zone.getAttribute('data-dragging')).toBe('true')
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(zone.getAttribute('data-dragging')).toBe('false')
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('ignores a drop with no file', () => {
    const onFile = vi.fn()
    const { getByTestId } = render(<Harness onFile={onFile} />)
    fireEvent.drop(getByTestId('zone'), { dataTransfer: { files: [] } })
    expect(onFile).not.toHaveBeenCalled()
  })
})
