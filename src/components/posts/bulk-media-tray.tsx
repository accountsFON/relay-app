'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  matchFilenameToPost,
  fillEmptyPostSlots,
  type MatchablePost,
} from '@/lib/media-match'
import { cn } from '@/lib/utils'

/**
 * Bulk drop tray for assigning media to multiple posts in a batch.
 *
 * Flow:
 *  1. AM drops N files (or clicks to pick)
 *  2. Each file is uploaded to Blob in parallel via @vercel/blob/client.upload()
 *  3. Filename auto-match runs (matchFilenameToPost in src/lib/media.ts):
 *     - "MM-DD.{ext}" → post on that month/day
 *     - "N.{ext}" or "0N.{ext}" → Nth post when sorted by postDate ascending
 *  4. Unmatched files surface in a "Drag to assign" zone
 *  5. AM drags unmatched files onto post slots
 *  6. AM clicks Apply → batched POST to /api/posts/[id]/media for each
 *     assignment, then onApplied() fires once.
 */

export type BulkMediaTrayPost = MatchablePost & {
  caption: string
}

export type BulkMediaTrayProps = {
  batchId: string
  posts: ReadonlyArray<BulkMediaTrayPost>
  onApplied: () => void
}

type UploadedFile = {
  /** A stable id so React keys + drag handlers don't depend on filename. */
  fileId: string
  filename: string
  url: string
  /** Post id this file is assigned to, or null if still in the unassigned zone. */
  assignedPostId: string | null
}

/**
 * Helper: given the current list of uploaded files and the post list, build
 * the bidirectional map (file → post id, post id → file). Pure function so
 * the component logic stays declarative.
 */
function buildAssignmentLookup(files: ReadonlyArray<UploadedFile>) {
  const byPostId = new Map<string, UploadedFile>()
  for (const f of files) {
    if (f.assignedPostId) byPostId.set(f.assignedPostId, f)
  }
  return byPostId
}

let fileIdCounter = 0
function nextFileId(): string {
  fileIdCounter += 1
  return `f-${fileIdCounter}-${Date.now()}`
}

export function BulkMediaTray({
  batchId,
  posts,
  onApplied,
}: BulkMediaTrayProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<ReadonlyArray<UploadedFile>>([])
  const [error, setError] = useState<string | null>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [isApplying, startApply] = useTransition()

  // batchId is currently a no-op (posts already scoped to it via the props),
  // but kept on the API so future server-side bulk endpoints can use it.
  void batchId

  const byPostId = useMemo(() => buildAssignmentLookup(files), [files])

  const sortedPosts = useMemo(
    () =>
      [...posts].sort(
        (a, b) => a.postDate.getTime() - b.postDate.getTime(),
      ),
    [posts],
  )

  const unassigned = files.filter((f) => f.assignedPostId === null)

  /**
   * Upload N files in parallel, then run filename auto-match on each. New
   * matches that conflict with existing assignments stay unassigned (the user
   * can drag them in manually).
   */
  const handleFiles = async (incoming: File[]) => {
    if (incoming.length === 0) return
    setError(null)
    setUploadingCount((n) => n + incoming.length)
    try {
      const uploaded = await Promise.all(
        incoming.map(async (file) => {
          // SDK handshake handles token request internally. We use the first
          // post in the batch as the auth anchor in clientPayload, the
          // route's onBeforeGenerateToken validates the actor has post.edit
          // on that post's org (which gates the entire batch since posts in
          // a batch share an org).
          const result = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/media/upload',
            clientPayload: sortedPosts[0]?.id ?? '',
          })
          return { filename: file.name, url: result.url }
        }),
      )

      // Run auto-match first (filename -> post). Conflict resolution: first
      // file to claim a slot wins; later conflicts stay unassigned. Then
      // fillEmptyPostSlots assigns any leftover unmatched files to the still-
      // empty slots in order, so a bulk drop of arbitrarily-named files still
      // lands on every post instead of silently sitting unassigned (and being
      // skipped on Apply). The AM can drag to reassign any mispairing before
      // applying.
      setFiles((prev) => {
        const next = [...prev]
        const claimedPostIds = new Set(
          next
            .map((f) => f.assignedPostId)
            .filter((x): x is string => x !== null),
        )
        for (const u of uploaded) {
          const matched = matchFilenameToPost(u.filename, sortedPosts)
          const assignedPostId =
            matched && !claimedPostIds.has(matched) ? matched : null
          if (assignedPostId) claimedPostIds.add(assignedPostId)
          next.push({
            fileId: nextFileId(),
            filename: u.filename,
            url: u.url,
            assignedPostId,
          })
        }
        return fillEmptyPostSlots(
          next,
          sortedPosts.map((p) => p.id),
        )
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingCount((n) => Math.max(0, n - incoming.length))
    }
  }

  /**
   * Move a file to a target post (or back to unassigned when targetPostId
   * is null). If the target slot already has a file, swap them (the existing
   * file goes back to unassigned).
   */
  const assignFile = (fileId: string, targetPostId: string | null) => {
    setFiles((prev) => {
      const moving = prev.find((f) => f.fileId === fileId)
      if (!moving) return prev
      const evicting = targetPostId
        ? prev.find((f) => f.assignedPostId === targetPostId)
        : null
      return prev.map((f) => {
        if (f.fileId === fileId) {
          return { ...f, assignedPostId: targetPostId }
        }
        if (evicting && f.fileId === evicting.fileId) {
          return { ...f, assignedPostId: null }
        }
        return f
      })
    })
  }

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId))
  }

  /**
   * Commit all assignments. POSTs in parallel; on success calls onApplied.
   * Local state is cleared after a successful apply.
   */
  const handleApply = () => {
    setError(null)
    const assignments = files.filter(
      (f): f is UploadedFile & { assignedPostId: string } =>
        f.assignedPostId !== null,
    )
    if (assignments.length === 0) {
      onApplied()
      return
    }
    startApply(async () => {
      try {
        await Promise.all(
          assignments.map((a) =>
            fetch(`/api/posts/${a.assignedPostId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: a.url }),
            }).then((r) => {
              if (!r.ok) throw new Error(`Persist failed for ${a.filename}`)
            }),
          ),
        )
        setFiles([])
        onApplied()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div
      data-testid="bulk-media-tray"
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold">Bulk media upload</p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Add files
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleApply}
            disabled={isApplying || files.length === 0}
            data-testid="bulk-media-apply"
          >
            {isApplying ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? [])
          if (list.length > 0) handleFiles(list)
          e.target.value = ''
        }}
      />

      {/* Drop zone for adding files */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const list = Array.from(e.dataTransfer.files ?? [])
          if (list.length > 0) handleFiles(list)
        }}
        data-testid="bulk-media-dropzone"
        className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-center"
      >
        {uploadingCount > 0 ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Uploading {uploadingCount}…
          </span>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Drop files here. We’ll auto match by filename
            (MM-DD.jpg or N.jpg).
          </p>
        )}
      </div>

      {/* Unassigned column */}
      <div
        data-testid="bulk-media-unassigned"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/plain')) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          const fileId = e.dataTransfer.getData('text/plain')
          if (fileId) assignFile(fileId, null)
        }}
        className="rounded-lg border border-dashed border-border p-3"
      >
        <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-2">
          Unassigned ({unassigned.length})
        </p>
        {unassigned.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No unmatched files.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((f) => (
              <li
                key={f.fileId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', f.fileId)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                data-testid={`bulk-media-unassigned-item-${f.filename}`}
                className="inline-flex items-center gap-2 rounded-md bg-neutral-100/60 px-2 py-1 text-[13px] cursor-grab active:cursor-grabbing"
              >
                <span>{f.filename}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.filename}`}
                  onClick={() => removeFile(f.fileId)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-post slots */}
      <ul className="flex flex-col gap-2">
        {sortedPosts.map((p, idx) => {
          const assigned = byPostId.get(p.id)
          const dateLabel = p.postDate.toISOString().slice(5, 10) // MM-DD
          return (
            <li
              key={p.id}
              data-testid={`bulk-media-slot-${p.id}`}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/plain')) {
                  e.preventDefault()
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                const fileId = e.dataTransfer.getData('text/plain')
                if (fileId) assignFile(fileId, p.id)
              }}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2',
                assigned && 'bg-neutral-100/40',
              )}
            >
              <span className="text-[13px] text-muted-foreground tabular-nums">
                #{idx + 1} · {dateLabel}
              </span>
              <span className="text-[13px] truncate flex-1 mx-2">
                {p.caption.slice(0, 60) || 'No caption'}
              </span>
              {assigned ? (
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', assigned.fileId)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  data-testid={`bulk-media-slot-assigned-${p.id}`}
                  className="inline-flex items-center gap-1 rounded-md bg-foreground/5 px-2 py-1 text-[12px] cursor-grab"
                >
                  {assigned.filename}
                </span>
              ) : (
                <span className="text-[12px] text-muted-foreground">
                  Drop a file here
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {error && (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
