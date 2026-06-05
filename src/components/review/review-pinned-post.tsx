'use client'

import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { MarkupOverlay, type OverlayPin } from '@/components/preview/markup-overlay'
import { PinPopover, type PinPopoverThread } from '@/components/preview/pin-popover'
import type { HydratedThread } from '@/server/repositories/threads'
import type { PinLocation, ThreadAuthor } from '@/types/preview'

/**
 * Read + resolve surface for the CLIENT pins on a single post, embedded on
 * the AM review session detail page. Reuses the markup primitives so it
 * behaves like the preview page: numbered image pins on the image, caption /
 * post pins as chips, a PinPopover (internal mode -> per-pin Resolve) on click.
 * Below the image a read-only list shows every pin's first comment so the AM
 * can read everything without clicking.
 *
 * New pins cannot be created here (overlay disabled). When onResolve is
 * omitted (the "already addressed" bucket), the popover shows no Resolve.
 */
export type ReviewPinnedPostProps = {
  postId: string
  mediaUrl: string | null
  caption: string
  threads: ReadonlyArray<HydratedThread>
  /** AM resolve action; omit to render the pins read-only. */
  onResolve?: (threadId: string) => Promise<void>
  /** AM comment append; omit to disable the composer's effect. */
  onComment?: (threadId: string, body: string) => Promise<void>
}

function pinKindLabel(pin: PinLocation): string {
  switch (pin.kind) {
    case 'image':
      return 'Image pin'
    case 'caption':
      return 'Caption pin'
    case 'post':
      return 'Post note'
  }
}

function authorName(author: ThreadAuthor): string {
  return author.kind === 'am' ? author.name : author.reviewerName
}

export function ReviewPinnedPost({
  postId,
  mediaUrl,
  caption,
  threads,
  onResolve,
  onComment,
}: ReviewPinnedPostProps) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)

  const imagePins: OverlayPin[] = threads
    .filter((t) => t.pin.kind === 'image')
    .map((t) => {
      const pin = t.pin as Extract<PinLocation, { kind: 'image' }>
      return { id: t.id, x: pin.x, y: pin.y, status: t.status }
    })

  const nonImagePins = threads.filter((t) => t.pin.kind !== 'image')
  const openThread = threads.find((t) => t.id === openThreadId) ?? null

  function openImagePin(id: string) {
    const el =
      typeof document !== 'undefined'
        ? (document.querySelector(
            `[data-testid="markup-overlay-pin"][data-thread-id="${id}"]`,
          ) as HTMLElement | null)
        : null
    const rect = el?.getBoundingClientRect() ?? null
    setOpenThreadId(id)
    setAnchor(
      rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null,
    )
  }

  function openChipPin(id: string, event: ReactMouseEvent<HTMLElement>) {
    setOpenThreadId(id)
    setAnchor('clientX' in event ? { x: event.clientX, y: event.clientY } : null)
  }

  const popoverThread: PinPopoverThread | null = openThread
    ? {
        id: openThread.id,
        pin: openThread.pin,
        status: openThread.status,
        firstComment: openThread.firstComment,
        commentCount: openThread.commentCount,
      }
    : null

  return (
    <div data-testid="review-pinned-post" data-post-id={postId} className="space-y-3">
      {mediaUrl ? (
        <div
          data-testid="review-pinned-post-media"
          className="relative w-full max-w-[470px] overflow-hidden rounded-xl bg-[#fafafa]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="" className="block w-full object-cover" />
          <MarkupOverlay
            existingPins={imagePins}
            onPinClick={openImagePin}
            onCreatePin={() => {}}
            disabled
          />
        </div>
      ) : (
        <div
          data-testid="review-pinned-post-no-media"
          className="flex h-40 w-full max-w-[470px] items-center justify-center rounded-xl bg-[#fafafa] text-[13px] text-[#8e8e8e]"
        >
          No image on this post
        </div>
      )}

      {nonImagePins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {nonImagePins.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid="review-pinned-post-chip"
              data-thread-id={t.id}
              onClick={(event) => openChipPin(t.id, event)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                t.status === 'open'
                  ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'bg-[#efefef] text-[#8e8e8e] hover:bg-[#e5e5e5]',
              )}
            >
              <span aria-hidden="true">📍</span>
              <span>{pinKindLabel(t.pin)}</span>
            </button>
          ))}
        </div>
      )}

      <ol
        data-testid="review-pinned-post-comment-list"
        className="space-y-1.5"
      >
        {threads.map((t, idx) => (
          <li
            key={t.id}
            data-testid="review-pin-comment"
            data-status={t.status}
            className={cn(
              'text-[13px]',
              t.status === 'resolved'
                ? 'text-muted-foreground line-through'
                : 'text-foreground',
            )}
          >
            <span className="font-semibold">
              {idx + 1}. {authorName(t.firstComment.author)}
            </span>
            {' — '}
            <span>
              {t.firstComment.body || (
                <em className="text-muted-foreground">No comment</em>
              )}
            </span>
          </li>
        ))}
      </ol>

      {popoverThread ? (
        <PinPopover
          thread={popoverThread}
          anchor={anchor}
          mode="internal"
          postId={postId}
          postCaption={caption}
          onComment={async (body) => {
            if (onComment) await onComment(popoverThread.id, body)
          }}
          onResolve={
            onResolve
              ? async () => {
                  await onResolve(popoverThread.id)
                  setOpenThreadId(null)
                  setAnchor(null)
                }
              : undefined
          }
          onClose={() => {
            setOpenThreadId(null)
            setAnchor(null)
          }}
        />
      ) : null}
    </div>
  )
}
