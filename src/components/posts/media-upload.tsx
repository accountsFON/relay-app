'use client'

import { useRef, useState } from 'react'
import { Trash2, Upload, Loader2 } from 'lucide-react'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { cn } from '@/lib/utils'
import { useReplacePostImage } from '@/components/posts/use-replace-post-image'

/**
 * Per-post drop zone for v1 (single image, mediaUrls[0]).
 *
 * Flow:
 *  1. AM drops or picks a file
 *  2. @vercel/blob/client.upload() handshakes with /api/media/upload
 *     (which uses Vercel's handleUpload to sign a short-lived client token),
 *     then PUTs bytes directly to Blob (NOT proxied through our server).
 *  3. POST /api/posts/[id]/media with the resulting URL → writes to mediaUrls[0]
 *  4. Calls onUploaded so the parent can refresh
 *
 * Replace and delete:
 *  - Drop a new file when one already exists → just overwrites mediaUrls[0]
 *    (route handler handles persistence; UI does not gate on "are you sure")
 *  - Trash icon → POST {url: ''} clears the URL slot
 */
export type MediaUploadProps = {
  postId: string
  currentMediaUrl?: string | null
  onUploaded: (url: string) => void
}

export function MediaUpload({
  postId,
  currentMediaUrl,
  onUploaded,
}: MediaUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // Shared upload flow (blob upload -> POST /media). refresh is off here: the
  // parent re-renders from the onUploaded callback, so a router.refresh() would
  // be redundant. clear() posts an empty url; onCleared reports '' to the parent.
  const {
    replace: handleFile,
    clear: handleClear,
    isPending,
    error,
  } = useReplacePostImage(postId, {
    onUploaded,
    onCleared: () => onUploaded(''),
    refresh: false,
  })

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  if (currentMediaUrl) {
    return (
      <div
        className="relative group rounded-xl overflow-hidden border border-border"
        data-testid="media-upload-current"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentMediaUrl}
          alt="Post media"
          className="w-full h-auto block"
        />
        {/*
          Trash button stays visible at reduced opacity by default so touch
          devices (which have no hover state) can still find the delete
          affordance. Brightens to full opacity on hover or keyboard focus.
        */}
        <SimpleTooltip content="Remove this image from the post">
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            aria-label="Remove image"
            data-testid="media-upload-remove"
            className="absolute top-2 right-2 inline-flex items-center justify-center rounded-md bg-black/60 text-white p-2 opacity-80 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </SimpleTooltip>
        {error && (
          <p className="text-[12px] text-destructive mt-1">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      aria-label="Upload image"
      data-testid="media-upload-dropzone"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors',
        'border-border hover:border-foreground/40',
        isDragging && 'border-foreground bg-neutral-100/40',
        isPending && 'opacity-60 pointer-events-none',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          // Reset so picking the same file twice still fires onChange.
          e.target.value = ''
        }}
      />
      {isPending ? (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">Uploading…</p>
        </>
      ) : (
        <>
          <Upload className="size-5 text-muted-foreground" />
          <p className="text-[13px] text-muted-foreground">
            Drop an image, or click to pick
          </p>
        </>
      )}
      {error && (
        <p className="text-[12px] text-destructive mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
