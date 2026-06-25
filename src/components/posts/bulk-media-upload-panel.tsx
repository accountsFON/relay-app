'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkMediaTray, type BulkMediaTrayPost } from '@/components/posts/bulk-media-tray'

export type BulkMediaUploadPanelProps = {
  batchId: string
  posts: ReadonlyArray<BulkMediaTrayPost>
}

/**
 * Prominent bulk-upload entry for the main batch run view.
 *
 * Resting state is a labeled card with an "Upload images" button; clicking it
 * expands the drag-and-drop mapping tray inline. The batch page is a server
 * component, so this client wrapper owns the post-apply router refresh that
 * re-pulls media into the post cards. The per-post MediaUpload on each card is
 * unaffected (this is the bulk path for mapping many images at once).
 */
export function BulkMediaUploadPanel({ batchId, posts }: BulkMediaUploadPanelProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <div
      data-testid="bulk-media-upload-panel"
      className="rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">Upload images</p>
          <p className="text-[13px] text-muted-foreground">
            Drop images and map them to posts in bulk. We’ll auto match by
            filename.
          </p>
        </div>
        {open ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            data-testid="bulk-media-close"
          >
            <ChevronUp className="size-4" />
            Hide
          </Button>
        ) : (
          <Button
            variant="accent"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="bulk-media-open"
          >
            <ImagePlus className="size-4" />
            Upload images
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-4">
          <BulkMediaTray
            batchId={batchId}
            posts={posts}
            onApplied={() => router.refresh()}
          />
        </div>
      )}
    </div>
  )
}
