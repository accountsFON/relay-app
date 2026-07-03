'use client'

import { useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Compact per-post revised-image upload for the designer branch of the
 * review-session feedback rail.
 *
 * The designer's review view is read only for client feedback (no
 * comment/resolve). The one write they legitimately need is the design work
 * itself: swapping in a revised image. This control mirrors the shared
 * MediaUpload flow exactly, in a compact button form that fits inline in the
 * rail:
 *  1. @vercel/blob/client.upload() handshakes with /api/media/upload (signed
 *     client token) then PUTs bytes directly to Blob.
 *  2. POST /api/posts/[id]/media with the resulting URL → writes mediaUrls[0].
 *     That route already gates on post.media.edit and blocks completed relays.
 *  3. router.refresh() so the new mediaUrls render on this surface.
 *
 * Unlike MediaUpload this has no clear/delete affordance: the designer replaces
 * an image, they do not remove it from this surface.
 */
export type DesignerRevisionUploadProps = {
  postId: string
  currentMediaUrl?: string | null
  /** Optional hook fired after a successful upload (in addition to the router
   *  refresh the control performs itself). */
  onUploaded?: (url: string) => void
}

export function DesignerRevisionUpload({
  postId,
  currentMediaUrl,
  onUploaded,
}: DesignerRevisionUploadProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
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

        onUploaded?.(result.url)
        // Server revalidates other surfaces but not this review-session path,
        // so refresh here to render the new mediaUrls.
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const label = currentMediaUrl ? 'Replace image' : 'Upload revised image'

  return (
    <div
      data-testid={`designer-revision-upload-${postId}`}
      className="mt-1 rounded-md border-l-2 border-primary bg-primary/5 px-2.5 py-2"
    >
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
        Revised image
      </p>
      {currentMediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentMediaUrl}
          alt="Current post media"
          className="mb-2 block w-full max-w-[160px] rounded-md border border-border"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid={`designer-revision-input-${postId}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          // Reset so picking the same file twice still fires onChange.
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        data-testid={`designer-revision-button-${postId}`}
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted disabled:opacity-60',
        )}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        {isPending ? 'Uploading…' : label}
      </button>
      {error && (
        <p
          role="alert"
          data-testid={`designer-revision-error-${postId}`}
          className="mt-1 text-[12px] text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  )
}
