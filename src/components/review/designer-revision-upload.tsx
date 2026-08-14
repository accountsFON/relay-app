'use client'

import { useRef } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReplacePostImage } from '@/components/posts/use-replace-post-image'

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
  /** Section heading. Defaults to the designer-revision wording; the rail
   *  passes a neutral 'Post image' when the viewer is not a designer working
   *  through revisions, since nothing has been revised yet in that case. */
  heading?: string
  /** Optional hook fired after a successful upload (in addition to the router
   *  refresh the control performs itself). */
  onUploaded?: (url: string) => void
}

export function DesignerRevisionUpload({
  postId,
  currentMediaUrl,
  heading = 'Revised image',
  onUploaded,
}: DesignerRevisionUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Shared upload flow (blob upload -> POST /media -> onUploaded -> refresh).
  // refresh defaults on: the server revalidates other surfaces but not this
  // review-session path, so we need the refresh to render the new mediaUrls.
  const { replace: handleFile, isPending, error } = useReplacePostImage(postId, {
    onUploaded,
  })

  const label = currentMediaUrl ? 'Replace image' : 'Upload revised image'

  return (
    <div
      data-testid={`designer-revision-upload-${postId}`}
      className="mt-1 rounded-md border-l-2 border-primary bg-primary/5 px-2.5 py-2"
    >
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
        {heading}
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
