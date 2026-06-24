'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent,
} from 'react'
import { Globe, Pencil, ThumbsUp, MessageCircle, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { facebookAspectRatio } from '@/lib/feed-aspect-ratio'
import type { FeedPostProps, PinLocation } from '@/types/preview'
import { MarkupOverlay, type OverlayPin } from './markup-overlay'
import { CaptionMarkup, type CaptionPin } from './caption-markup'
import { PinPopover, type PinPopoverThread } from './pin-popover'
import { PinDraftComposer } from './pin-draft-composer'

type DraftPin = {
  pin: PinLocation
  anchor: { x: number; y: number } | null
}

// Facebook allows visibly longer captions before "See more" than IG.
// 280 chars is a reasonable mid fidelity threshold.
const FB_TRUNCATE_LIMIT = 280

function firstLetter(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}

type Thread = FeedPostProps['threads'][number]

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

export function FacebookPost(props: FeedPostProps) {
  const {
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
  } = props
  const [expanded, setExpanded] = useState(false)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null)
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null)
  const [naturalAspectRatio, setNaturalAspectRatio] = useState<number | null>(null)
  // `view original / back to your edit` peek toggle when captionOverride is set.
  const [showOriginal, setShowOriginal] = useState(false)
  // Ref to the media <img> so we can read naturalWidth/Height for cached
  // images. Browsers don't fire `load` on already-decoded images.
  const mediaImgRef = useRef<HTMLImageElement | null>(null)
  // Captured at mousedown so the draft composer can anchor near the click
  // that triggered pin creation. MarkupOverlay/CaptionMarkup callbacks
  // don't carry viewport coords on their own.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null)

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

  const displayAspectRatio = facebookAspectRatio(naturalAspectRatio)

  const captionFull =
    (captionOverride !== undefined && !showOriginal ? captionOverride : post.caption) ?? ''
  const needsTruncation = captionFull.length > FB_TRUNCATE_LIMIT
  const captionDisplay =
    expanded || !needsTruncation
      ? captionFull
      : captionFull.slice(0, FB_TRUNCATE_LIMIT).trimEnd()

  const draftValue = captionDraft ?? ''
  const saveDisabled = draftValue.trim().length === 0 || draftValue === (post.caption ?? '')

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
  const openThread: Thread | null =
    threads.find((t) => t.id === openThreadId) ?? null

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
      data-testid="facebook-post"
      data-post-id={post.id}
      data-mode={mode}
      onMouseDownCapture={recordPointer}
      className="w-full max-w-[500px] rounded-lg border border-[#dadde1] bg-white font-[system-ui,-apple-system,'Segoe_UI',sans-serif] text-[#1c1e21] shadow-sm"
    >
      {/* Header: avatar + client name + Sponsored row */}
      <header className="flex items-center gap-3 px-3 pt-3 pb-2">
        {client.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.avatarUrl}
            alt=""
            data-testid="fb-avatar-image"
            className="size-10 rounded-md object-cover"
          />
        ) : (
          <div
            data-testid="fb-avatar-fallback"
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-md bg-[#1877f2] text-base font-bold text-white"
          >
            {firstLetter(client.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-[#050505]">
            {client.name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] leading-tight text-[#65676b]">
            <span>Sponsored</span>
            <span aria-hidden="true">·</span>
            <Globe aria-label="Public" className="size-3" strokeWidth={2} />
          </div>
        </div>
      </header>

      {/* Caption ABOVE image (Facebook layout) */}
      <div
        data-testid="fb-caption"
        className="px-3 pb-2 text-[15px] leading-[1.3333] text-[#050505]"
      >
        {editing ? (
          <div
            className="flex flex-col gap-2"
            data-testid="facebook-post-inline-editor"
          >
            <textarea
              data-testid="caption-edit-inline-textarea"
              value={draftValue}
              onChange={(e) => onCaptionDraftChange?.(e.target.value)}
              onPaste={(e) => {
                // Belt-and-suspenders: sync React state to the textarea's
                // actual value after a paste lands. See IG component for the
                // multi-byte-character rationale.
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
              className="w-full min-h-[180px] resize-y rounded-md border border-[#ced0d4] bg-white px-3 py-2 text-[15px] leading-[1.3333] text-[#050505] outline-none focus:border-[#1877f2]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="caption-edit-inline-cancel"
                onClick={() => onCaptionEditCancel?.()}
                className="rounded-md px-3 py-1.5 text-[14px] font-medium text-[#65676b] hover:bg-[#f2f2f2]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="caption-edit-inline-save"
                onClick={() => void onCaptionEditSave?.()}
                disabled={saveDisabled}
                className="rounded-md bg-[#1877f2] px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-[#1668d6] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-line">
            <CaptionMarkup
              caption={captionDisplay}
              existingPins={captionPins.filter((p) => p.to <= captionDisplay.length)}
              onPinClick={(id) => openThreadAt(id, null)}
              onCreatePin={handleCreateCaptionPin}
            />
            {needsTruncation && !expanded && (
              <>
                {'… '}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="cursor-pointer font-semibold text-[#65676b] hover:underline"
                >
                  See more
                </button>
              </>
            )}
          </div>
        )}

        {!editing && onEditCaption && (
          <button
            type="button"
            data-testid="facebook-post-edit-copy"
            onClick={onEditCaption}
            className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#1877f2] bg-white px-4 py-1.5 text-[13px] font-semibold text-[#1877f2] hover:bg-[#1877f2] hover:text-white transition-colors"
          >
            <Pencil aria-hidden className="h-3.5 w-3.5" />
            Edit copy
          </button>
        )}

        {!editing && captionOverride !== undefined && (
          <p
            className="mt-1 text-[12px] text-[#65676b]"
            data-testid="facebook-post-edit-indicator"
          >
            Edited{' · '}
            <button
              type="button"
              data-testid="facebook-post-toggle-original"
              onClick={() => setShowOriginal((prev) => !prev)}
              className="text-[#1877f2] hover:underline"
            >
              {showOriginal ? 'back to your edit' : 'view original'}
            </button>
          </p>
        )}

        {!editing && post.hashtags.length > 0 && (
          <div className="mt-1 text-[#1877f2]">
            {post.hashtags
              .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
              .join(' ')}
          </div>
        )}
      </div>

      {/* Image renders at the photo's natural aspect ratio (FB has no hard
          clamp). Falls back to 1.91:1 landscape while loading or when
          mediaUrl is null. */}
      <div className="relative">
        {post.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={mediaImgRef}
            src={post.mediaUrl}
            alt=""
            data-testid="fb-media"
            onLoad={handleMediaLoad}
            className="block w-full"
            style={{ aspectRatio: displayAspectRatio, objectFit: 'cover' }}
          />
        ) : (
          <div
            data-testid="fb-media-placeholder"
            className="flex w-full items-center justify-center bg-gradient-to-br from-[#7ad3f5] to-[#3e8dc4] text-xs text-white/80"
            style={{ aspectRatio: displayAspectRatio }}
          >
            image goes here
          </div>
        )}

        <MarkupOverlay
          existingPins={imagePins}
          onPinClick={(id) => {
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
      </div>

      {/* Action row: Like / Comment / Share */}
      <div className="mt-1 flex items-center justify-around border-t border-[#ced0d4] px-3 py-1">
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <ThumbsUp className="size-5" />
          <span>Like</span>
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <MessageCircle className="size-5" />
          <span>Comment</span>
        </button>
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 rounded-md py-1.5 text-[15px] font-semibold text-[#65676b] hover:bg-[#f2f2f2]"
        >
          <Share2 className="size-5" />
          <span>Share</span>
        </button>
      </div>

      {postLevelPins.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-[#ced0d4] px-3 py-2"
          data-testid="fb-post-pins"
        >
          {postLevelPins.map((thread) => (
            <button
              key={thread.id}
              type="button"
              data-testid="fb-pin-badge"
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

      {popoverThread ? (
        <PinPopover
          thread={popoverThread}
          anchor={popoverAnchor}
          mode={mode}
          postId={post.id}
          postCaption={post.caption}
          onComment={handleComment}
          onUploadImage={onUploadImage}
          onUseAsPostImage={mode === 'internal' ? onUseAsPostImage : undefined}
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
          onCancel={() => setDraftPin(null)}
        />
      ) : null}
    </article>
  )
}
