'use client'

import { useState } from 'react'

export type ImageDropProps = {
  onDragOver: (e: React.DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent<HTMLElement>) => void
}

/** Drag state + handlers for a file drop zone. Spread `dragProps` on the
 *  container (NOT an overlay) so child clicks (e.g. pin creation) are never
 *  blocked. */
export function useImageDrop(onFile: (file: File) => void): {
  isDragging: boolean
  dragProps: ImageDropProps
} {
  const [isDragging, setIsDragging] = useState(false)
  return {
    isDragging,
    dragProps: {
      onDragOver: (e) => {
        e.preventDefault()
        setIsDragging(true)
      },
      onDragLeave: () => setIsDragging(false),
      onDrop: (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      },
    },
  }
}
