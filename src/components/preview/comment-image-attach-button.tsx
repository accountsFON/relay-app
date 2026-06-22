'use client'

import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

export type AttachedImage = { url: string; width: number; height: number }

export type CommentImageAttachButtonProps = {
  onUploadImage: (file: File) => Promise<AttachedImage>
  /** Current attached image (controlled) */
  value: AttachedImage | null
  onChange: (img: AttachedImage | null) => void
  disabled?: boolean
}

/**
 * Shared attach-image control used by both PinDraftComposer and PinPopover.
 * Renders a paperclip button that opens a hidden file input. On pick it:
 *   1. Rejects files larger than 5 MB with an inline error.
 *   2. Calls onUploadImage(file); disables the control while uploading.
 *   3. On success, passes the result to onChange and renders a thumbnail
 *      preview with an ×-remove button.
 */
export function CommentImageAttachButton({
  onUploadImage,
  value,
  onChange,
  disabled = false,
}: CommentImageAttachButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDisabled = disabled || uploading

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so picking the same file again triggers onChange next time.
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('Image must be 5 MB or smaller.')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const result = await onUploadImage(file)
      onChange(result)
    } catch {
      setError('Upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {value ? (
        // Thumbnail + remove
        <div className="relative inline-flex w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.url}
            alt="Attached image"
            data-testid="comment-image-preview"
            className="h-16 w-auto max-w-[160px] rounded-md border border-[#dbdbdb] object-cover"
          />
          <button
            type="button"
            data-testid="comment-image-remove"
            aria-label="Remove attached image"
            onClick={() => {
              onChange(null)
              setError(null)
            }}
            disabled={isDisabled}
            className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-[#262626] text-white hover:bg-black disabled:cursor-not-allowed"
          >
            <X className="size-3" strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="comment-image-attach"
          aria-label="Attach image"
          onClick={() => inputRef.current?.click()}
          disabled={isDisabled}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-[#8e8e8e] hover:bg-[#f5f5f5] hover:text-[#262626]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Paperclip className="size-3.5" />
          <span>{uploading ? 'Uploading…' : 'Attach image'}</span>
        </button>
      )}

      {error ? (
        <p
          data-testid="comment-image-error"
          className="text-[11px] text-red-600"
        >
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        data-testid="comment-image-file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
    </div>
  )
}
