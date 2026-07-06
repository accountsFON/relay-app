'use client'

import { useRef, type ReactNode } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { useReplacePostImage } from '@/components/posts/use-replace-post-image'
import { useImageDrop, type ImageDropProps } from '@/components/preview/use-image-drop'

/**
 * In-place image replace for a /preview post. The caller spreads `dragProps`
 * on the EXISTING image container (drag handlers there don't block child pin
 * clicks and drops are delivered natively) and renders `overlay` inside it.
 * `overlay` is pointer-events-none except its interactive pieces: a designer
 * whole-image pick button (pinsActive=false) or an AM corner button
 * (pinsActive=true, so image clicks stay pin-create). The drag-over hint shows
 * only while dragging.
 */
export function usePostImageReplace({
  postId,
  pinsActive,
}: {
  postId: string
  pinsActive: boolean
}): { dragProps: ImageDropProps; isDragging: boolean; overlay: ReactNode } {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { replace, isPending, error } = useReplacePostImage(postId)
  const { isDragging, dragProps } = useImageDrop(replace)

  const pick = () => inputRef.current?.click()

  const overlay = (
    <div className="pointer-events-none absolute inset-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="post-image-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) replace(f)
          e.target.value = ''
        }}
      />

      {!pinsActive && (
        <button
          type="button"
          data-testid="post-image-pick"
          onClick={pick}
          className="pointer-events-auto absolute inset-0 h-full w-full cursor-pointer bg-transparent"
          aria-label="Replace image"
        />
      )}

      {pinsActive && (
        <button
          type="button"
          data-testid="post-image-replace-button"
          onClick={pick}
          className="pointer-events-auto absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/75"
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
          {isPending ? 'Uploading…' : 'Replace'}
        </button>
      )}

      {isDragging && (
        <div
          data-testid="post-image-drop-overlay"
          className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-[13px] font-medium text-primary"
        >
          Drop to replace image
        </div>
      )}

      {isPending && !pinsActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 className="size-6 animate-spin text-white" />
        </div>
      )}

      {error && (
        <p
          role="alert"
          data-testid="post-image-replace-error"
          className="absolute inset-x-0 bottom-0 bg-destructive/90 px-2 py-1 text-[11px] text-white"
        >
          {error}
        </p>
      )}
    </div>
  )

  return { dragProps, isDragging, overlay }
}
