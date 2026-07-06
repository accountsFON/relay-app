'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clampInstagramAspectRatio } from '@/lib/feed-aspect-ratio'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { MarkupOverlay, type OverlayPin } from './markup-overlay'
import { CaptionMarkup, type CaptionPin } from './caption-markup'
import { PinPopover, type PinPopoverThread } from './pin-popover'
import { PinDraftComposer } from './pin-draft-composer'
import { usePostImageReplace } from '@/components/preview/post-image-replace'

type DraftPin = {
  pin: PinLocation
  anchor: { x: number; y: number } | null
}

/**
 * Instagram feed post (mid fidelity).
 *
 * Pure presentational component. Renders a single Post inside Instagram-like
 * chrome (avatar gradient, bold username, Sponsored subline, square 1/1 image,
 * heart/comment/share row, caption with "...more" truncation past 120 chars).
 *
 * Layer 2.3 wires the markup primitives in:
 *   - MarkupOverlay sits over the image, drops new image pins on click and
 *     renders existing image-pinned threads as numbered badges.
 *   - CaptionMarkup wraps the caption text, highlights caption-range pins,
 *     and floats a Comment button when the reader selects text.
 *   - PinPopover renders for whichever thread is currently "open" via local
 *     state, anchored near the pin (image, caption, or below-badge).
 *
 * Callbacks: onCreateThread (drop a new pin), onComment (append to a thread),
 * onResolveThread (AM only). When a callback is missing, the corresponding
 * affordance hides.
 */

const CAPTION_TRUNCATE_AT = 120

function instagramHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30) || 'client'
}

function pinKindLabel(pin: PinLocation): string {
  switch (pin.kind) {
    case 'image':
      return 'image pin'
    case 'caption':
      return 'caption pin'
    case 'post':
      return 'post pin'
  }
}

export function InstagramFeedPost({
  post,
  client,
  threads,
  mode,
  onOpenThread,
  onCreateThread,
  onComment,
  onUploadImage,
  onUseAsPostImage,
  onResolveThread,
  editing = false,
  captionDraft,
  onCaptionDraftChange,
  onCaptionEditSave,
  onCaptionEditCancel,
  captionOverride,
  onEditCaption,
  suppressInlinePopover = false,
  mentionRoster = [],
  canReplaceImage,
  pinsActive,
}: FeedPostProps) {
  const imageReplace = usePostImageReplace({ postId: post.id, pinsActive: !!pinsActive })
  const [expanded, setExpanded] = useState(false)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null)
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null)
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null)
  // Local toggle for `view original / back to your edit` when captionOverride
  // is set and the reviewer wants to peek at the original caption. View only,
  // never persisted.
  const [showOriginal, setShowOriginal] = useState(false)
  // Track the last pointer position inside the post so we can anchor the
  // draft composer near the click that triggered the pin creation. The
  // MarkupOverlay/CaptionMarkup callbacks don't carry viewport coords, so
  // we capture them here at mousedown.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
  // Ref to the media <img> so we can read naturalWidth/Height for cached
  // images. Browsers don't fire `load` on already-decoded images, so the
  // onLoad handler alone misses those (very common on second visits).
  const mediaImgRef = useRef<HTMLImageElement | null>(null)

  function recordPointer(event: ReactMouseEvent<HTMLElement>) {
    lastPointerRef.current = { x: event.clientX, y: event.clientY }
  }

  function handleMediaLoad(event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalAspectRatio(naturalWidth / naturalHeight)
    }
  }

  // Pick up cached images that decoded before React attached onLoad.
  useEffect(() => {
    const img = mediaImgRef.current
    if (!img) return
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNaturalAspectRatio(img.naturalWidth / img.naturalHeight)
    }
  }, [post.mediaUrl])

  const displayAspectRatio = clampInstagramAspectRatio(naturalAspectRatio)

  const handle = useMemo(() => instagramHandle(client.name), [client.name])

  // When the reviewer has saved a suggested caption (captionOverride) we
  // render that in the chrome instead of post.caption, unless they've
  // tapped `view original` to peek at the original.
  const displayedCaption =
    captionOverride !== undefined && !showOriginal ? captionOverride : post.caption
  const isLong = displayedCaption.length > CAPTION_TRUNCATE_AT
  const visibleCaption =
    isLong && !expanded
      ? displayedCaption.slice(0, CAPTION_TRUNCATE_AT).trimEnd()
      : displayedCaption

  const draftValue = captionDraft ?? ''
  const saveDisabled = draftValue.trim().length === 0 || draftValue === post.caption

  const imagePins: OverlayPin[] = useMemo(
    () =>
      threads
        .filter((t) => t.pin.kind === 'image')
        .map((t) => {
          const pin = t.pin as Extract<PinLocation, { kind: 'image' }>
          return { id: t.id, x: pin.x, y: pin.y, status: t.status }
        }),
    [threads],
  )

  const captionPins: CaptionPin[] = useMemo(
    () =>
      threads
        .filter((t) => t.pin.kind === 'caption')
        .map((t) => {
          const pin = t.pin as Extract<PinLocation, { kind: 'caption' }>
          return { id: t.id, from: pin.from, to: pin.to, status: t.status }
        }),
    [threads],
  )

  const postLevelPins = threads.filter((t) => t.pin.kind === 'post')
  const openThread = threads.find((t) => t.id === openThreadId) ?? null

  function openThreadAt(
    threadId: string,
    event: ReactMouseEvent<HTMLElement> | null,
  ) {
    if (!suppressInlinePopover) {
      setOpenThreadId(threadId)
      if (event && 'clientX' in event) {
        setPopoverAnchor({ x: event.clientX, y: event.clientY })
      } else {
        setPopoverAnchor(null)
      }
    }
    onOpenThread?.(threadId)
  }

  function handleCreateImagePin(x: number, y: number) {
    if (!onCreateThread) return
    setDraftPin({
      pin: { kind: 'image', x, y },
      anchor: lastPointerRef.current,
    })
  }

  function handleCreateCaptionPin(from: number, to: number) {
    if (!onCreateThread) return
    setDraftPin({
      pin: { kind: 'caption', from, to },
      anchor: lastPointerRef.current,
    })
  }

  async function handleDraftSubmit(
    body: string,
    image?: { url: string; width: number; height: number },
  ) {
    if (!draftPin || !onCreateThread) return
    await onCreateThread(draftPin.pin, body, image)
    setDraftPin(null)
  }

  async function handleComment(
    body: string,
    image?: { url: string; width: number; height: number },
  ) {
    if (!openThreadId || !onComment) return
    await onComment(openThreadId, body, image)
  }

  async function handleResolve() {
    if (!openThreadId || !onResolveThread) return
    await onResolveThread(openThreadId)
    setOpenThreadId(null)
  }

  // Adapter: FeedPostProps.threads → PinPopoverThread shape.
  const popoverThread: PinPopoverThread | null = openThread
    ? {
        id: openThread.id,
        pin: openThread.pin,
        status: openThread.status,
        firstComment: openThread.firstComment,
        comments: openThread.comments,
        commentCount: openThread.commentCount,
      }
    : null

  return (
    <article
      data-testid="instagram-post"
      data-post-id={post.id}
      data-mode={mode}
      onMouseDownCapture={recordPointer}
      className="mx-auto w-full max-w-[470px] overflow-hidden rounded-lg border border-[#dbdbdb] bg-white text-[14px] text-[#262626]"
    >
      {/* Header: avatar + username + Sponsored */}
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="relative inline-block size-8 rounded-full p-[2px]"
          style={{
            background:
              'conic-gradient(from 180deg at 50% 50%, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)',
          }}
        >
          {client.avatarUrl ? (
            <img
              src={client.avatarUrl}
              alt={`${client.name} avatar`}
              data-testid="instagram-post-avatar"
              className="block size-full rounded-full border-2 border-white object-cover"
            />
          ) : (
            <span
              data-testid="instagram-post-avatar"
              data-fallback="1"
              className="flex size-full items-center justify-center rounded-full border-2 border-white bg-white text-[12px] font-semibold uppercase text-[#262626]"
            >
              {client.name.charAt(0) || '?'}
            </span>
          )}
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[14px] font-semibold text-[#262626]">
            {handle}
          </span>
          <span className="truncate text-[12px] text-[#8e8e8e]">Sponsored</span>
        </div>
      </header>

      {/* Media + markup overlay. Container aspect ratio adapts to the
          image's natural ratio within IG's allowed range (4:5 to 1.91:1).
          Falls back to a square while loading or when mediaUrl is null. */}
      <div
        className="relative w-full overflow-hidden bg-[#fafafa]"
        style={{ aspectRatio: displayAspectRatio }}
        data-testid="instagram-post-media"
        {...(canReplaceImage ? imageReplace.dragProps : {})}
      >
        {post.mediaUrl ? (
          <img
            ref={mediaImgRef}
            src={post.mediaUrl}
            alt=""
            onLoad={handleMediaLoad}
            className="block size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[13px] text-[#8e8e8e]">
            image goes here
          </div>
        )}

        <MarkupOverlay
          existingPins={imagePins}
          onPinClick={(id) => {
            // Anchor the popover at the pin badge's screen position.
            if (!suppressInlinePopover) {
              const el =
                typeof document !== 'undefined'
                  ? (document.querySelector(
                      `[data-testid="markup-overlay-pin"][data-thread-id="${id}"]`,
                    ) as HTMLElement | null)
                  : null
              const rect = el?.getBoundingClientRect() ?? null
              if (rect) {
                setOpenThreadId(id)
                setPopoverAnchor({
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                })
              } else {
                setOpenThreadId(id)
                setPopoverAnchor(null)
              }
            }
            onOpenThread?.(id)
          }}
          onCreatePin={handleCreateImagePin}
          disabled={!onCreateThread}
        />

        {canReplaceImage && imageReplace.overlay}
      </div>

      {/* Action row */}
      <div
        className="flex items-center gap-4 px-3 pt-2 pb-1 text-[22px] leading-none text-[#262626]"
        aria-hidden="true"
      >
        <span>♡</span>
        <span>💬</span>
        <span>↗</span>
      </div>

      {/* Caption */}
      <div className="px-3 pt-1 pb-3 text-[14px] leading-snug text-[#262626]">
        {editing ? (
          <div
            className="flex flex-col gap-2"
            data-testid="instagram-post-inline-editor"
          >
            <b className="font-semibold">{handle}</b>
            <textarea
              data-testid="caption-edit-inline-textarea"
              value={draftValue}
              onChange={(e) => onCaptionDraftChange?.(e.target.value)}
              onPaste={(e) => {
                // Belt-and-suspenders: read the textarea's actual value on the
                // next tick and sync state. Some browsers don't fire React's
                // synthetic onChange consistently on paste of multi-byte
                // characters (emoji, IME sequences).
                const el = e.currentTarget
                setTimeout(() => {
                  if (el && el.value !== draftValue) {
                    onCaptionDraftChange?.(el.value)
                  }
                }, 0)
              }}
              rows={8}
              autoFocus
              aria-label="Edit suggested caption"
              className="w-full min-h-[180px] resize-y rounded-md border border-[#dbdbdb] bg-white px-3 py-2 text-[14px] leading-snug text-[#262626] outline-none focus:border-[#0095f6]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="caption-edit-inline-cancel"
                onClick={() => onCaptionEditCancel?.()}
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[#262626] hover:bg-[#fafafa]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="caption-edit-inline-save"
                onClick={() => void onCaptionEditSave?.()}
                disabled={saveDisabled}
                className="rounded-md bg-[#0095f6] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#1877f2] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <p
            className="whitespace-pre-line"
            data-testid="instagram-post-caption"
          >
            <b className="font-semibold">{handle}</b>{' '}
            <CaptionMarkup
              caption={visibleCaption}
              existingPins={captionPins.filter((p) => p.to <= visibleCaption.length)}
              onPinClick={(id) => openThreadAt(id, null)}
              onCreatePin={handleCreateCaptionPin}
            />
            {isLong && !expanded && (
              <>
                {'... '}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-[#8e8e8e] hover:text-[#262626]"
                  data-testid="instagram-post-more"
                >
                  more
                </button>
              </>
            )}
          </p>
        )}

        {!editing && onEditCaption && (
          <button
            type="button"
            data-testid="instagram-post-edit-copy"
            onClick={onEditCaption}
            className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#00376b] bg-white px-4 py-1.5 text-[13px] font-semibold text-[#00376b] hover:bg-[#00376b] hover:text-white transition-colors"
          >
            <Pencil aria-hidden className="h-3.5 w-3.5" />
            Edit copy
          </button>
        )}

        {!editing && captionOverride !== undefined && (
          <p
            className="mt-1 text-[12px] text-[#8e8e8e]"
            data-testid="instagram-post-edit-indicator"
          >
            Edited{' · '}
            <button
              type="button"
              data-testid="instagram-post-toggle-original"
              onClick={() => setShowOriginal((prev) => !prev)}
              className="text-[#00376b] hover:underline"
            >
              {showOriginal ? 'back to your edit' : 'view original'}
            </button>
          </p>
        )}

        {post.hashtags.length > 0 && (
          <p
            className="mt-1 text-[14px] text-[#00376b]"
            data-testid="instagram-post-hashtags"
          >
            {post.hashtags
              .map((h) => (h.startsWith('#') ? h : `#${h}`))
              .join(' ')}
          </p>
        )}

        {/* Post-level pins (caption + image pins now live in their own
            primitives). Clicking a badge opens the popover. */}
        {postLevelPins.length > 0 && (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            data-testid="instagram-post-non-image-pins"
          >
            {postLevelPins.map((thread) => (
              <button
                key={thread.id}
                type="button"
                data-testid="instagram-post-pin"
                data-thread-id={thread.id}
                aria-label={`Open ${pinKindLabel(thread.pin)} thread`}
                onClick={(event) => openThreadAt(thread.id, event)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  thread.status === 'open'
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'bg-[#efefef] text-[#8e8e8e] hover:bg-[#e5e5e5]',
                )}
              >
                <span aria-hidden="true">📍</span>
                <span>Post · {thread.commentCount}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {popoverThread ? (
        <PinPopover
          thread={popoverThread}
          anchor={popoverAnchor}
          mode={mode}
          onComment={handleComment}
          onUploadImage={onUploadImage}
          onUseAsPostImage={mode === 'internal' ? onUseAsPostImage : undefined}
          mentionRoster={mentionRoster}
          onResolve={
            mode === 'internal' && onResolveThread ? handleResolve : undefined
          }
          onClose={() => {
            setOpenThreadId(null)
            setPopoverAnchor(null)
          }}
        />
      ) : null}

      {draftPin ? (
        <PinDraftComposer
          anchor={draftPin.anchor}
          onSubmit={handleDraftSubmit}
          onUploadImage={onUploadImage}
          mentionRoster={mentionRoster}
          onCancel={() => setDraftPin(null)}
        />
      ) : null}
    </article>
  )
}
