'use client'

import { useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { Trash2, Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleFile = (file: File) => {
    setError(null)
    startTransition(async () => {
      try {
        // Step 1+2: SDK handshake (token request happens inside upload()),
        // then direct upload to Blob. clientPayload carries postId so the
        // route's onBeforeGenerateToken can authorize the post.
        const result = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/media/upload',
          clientPayload: postId,
        })

        // Step 3: persist the URL on the post.
        const persistRes = await fetch(`/api/posts/${postId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url }),
        })
        if (!persistRes.ok) {
          const text = await persistRes.text()
          throw new Error(`Persist URL failed: ${text}`)
        }

        onUploaded(result.url)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const handleClear = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: '' }),
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`Clear failed: ${text}`)
        }
        onUploaded('')
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

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
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          aria-label="Remove image"
          className="absolute top-2 right-2 inline-flex items-center justify-center rounded-md bg-black/60 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
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
        isDragging && 'border-foreground bg-cream-warm/40',
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
