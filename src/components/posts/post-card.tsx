'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Linkify } from '@/components/ui/linkify'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updatePostAction, redoPostAction } from '@/server/actions/posts'
import { cn } from '@/lib/utils'
import { usePostListCollapse } from '@/components/posts/post-list-collapse'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'
import { QaEditedIndicator } from '@/components/posts/qa-edited-indicator'
import { MediaUpload } from '@/components/posts/media-upload'
import { useUnsavedChanges } from '@/lib/unsaved-changes'

type Post = {
  id: string
  postDate: Date
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
  preQaCaption?: string | null
  deletedAt?: Date | null
}

export function PostCard({
  post,
  canEdit = false,
  postNumber,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onToggleCollapsed,
  mediaUrl = null,
  canUploadMedia = false,
}: {
  post: Post
  canEdit?: boolean
  /** 1-based position in the post list, used in the collapsed header strip. */
  postNumber?: number
  /** Controlled collapsed state. If omitted, uses context or local state. */
  collapsed?: boolean
  /** Initial collapsed state when uncontrolled and no context is present. */
  defaultCollapsed?: boolean
  /** Called when the user clicks the collapse chevron in uncontrolled mode. */
  onToggleCollapsed?: (next: boolean) => void
  /** Post image URL (mediaUrls[0]). Null when no image is attached. */
  mediaUrl?: string | null
  /** Whether the viewer may upload/replace/remove this post's image (post.media.edit). */
  canUploadMedia?: boolean
}) {
  const router = useRouter()
  const listCollapse = usePostListCollapse()
  const [isEditing, setIsEditing] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [hashtags, setHashtags] = useState(post.hashtags.join(' '))
  const [graphicHook, setGraphicHook] = useState(post.graphicHook ?? '')
  const [designerNotes, setDesignerNotes] = useState(post.designerNotes ?? '')
  const isCaptionDirty =
    isEditing &&
    (caption !== post.caption ||
      hashtags !== post.hashtags.join(' ') ||
      graphicHook !== (post.graphicHook ?? '') ||
      designerNotes !== (post.designerNotes ?? ''))
  useUnsavedChanges(isCaptionDirty)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [redoConfirmOpen, setRedoConfirmOpen] = useState(false)
  const [localCollapsed, setLocalCollapsed] = useState(defaultCollapsed)

  const isArchived = Boolean(post.deletedAt)

  // Resolution order: explicit prop wins, then list context, then local state.
  const collapsed =
    collapsedProp ?? listCollapse?.isCollapsed(post.id) ?? localCollapsed

  const handleCollapseToggle = () => {
    const next = !collapsed
    if (listCollapse) {
      listCollapse.setCollapsed(post.id, next)
    } else {
      setLocalCollapsed(next)
    }
    onToggleCollapsed?.(next)
  }

  const dateLabel = post.postDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updatePostAction(post.id, {
          caption,
          hashtags: hashtags.split(/\s+/).filter(Boolean),
          graphicHook: graphicHook || null,
          designerNotes: designerNotes || null,
        })
        setIsEditing(false)
      } catch {
        // A thrown server-action error is masked as an opaque digest in
        // production, so we surface a generic friendly message rather than
        // e.message (which would be the raw reference number).
        toast.error(
          "Couldn't save your changes. You may not have permission to edit captions.",
        )
      }
    })
  }

  const handleCopy = () => {
    // Copy from props (the live server state), not the edit buffers, so a
    // redo/restore that changed the post is reflected in what gets copied.
    const text = `${post.caption}\n\n${post.hashtags.join(' ')}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRedo = () => {
    setRedoConfirmOpen(false)
    startTransition(async () => {
      try {
        await redoPostAction(post.id)
        router.refresh()
        toast.success('Caption regenerated. Prior version saved in history.')
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'AI redo failed; nothing was changed.',
        )
      }
    })
  }

  return (
    <>
      <Card
        data-post-id={post.id}
        data-archived={isArchived ? '1' : undefined}
        data-collapsed={collapsed ? '1' : undefined}
        className={cn(isArchived && 'opacity-50 grayscale pointer-events-none')}
      >
        {/* Header strip: always rendered. Acts as the slim collapsed view
            when `collapsed` is true, and as the title row otherwise. */}
        <div
          className={cn(
            'px-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
            collapsed && 'py-3',
          )}
        >
          <button
            type="button"
            onClick={handleCollapseToggle}
            aria-expanded={!collapsed}
            aria-controls={`post-body-${post.id}`}
            aria-label={collapsed ? 'Expand post' : 'Collapse post'}
            className="pointer-events-auto flex flex-1 items-center gap-3 text-left min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true" className="text-muted-foreground shrink-0">
              {collapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </span>
            {typeof postNumber === 'number' && (
              <span className="text-[12px] font-semibold tabular-nums text-muted-foreground shrink-0">
                #{postNumber}
              </span>
            )}
            <span className="text-[15px] font-semibold text-foreground shrink-0">
              {dateLabel}
            </span>
            {isArchived && (
              <SimpleTooltip content="This post is archived and hidden from active views">
                <Badge variant="secondary" className="shrink-0">
                  Archived
                </Badge>
              </SimpleTooltip>
            )}
            {collapsed && (
              <span className="text-[14px] text-muted-foreground line-clamp-1 min-w-0 flex-1">
                {post.caption || 'No caption yet'}
              </span>
            )}
          </button>
          {!collapsed && (
            <div className="flex flex-wrap items-center gap-2">
              {!isArchived && (
                <SimpleTooltip content="Copy caption to clipboard">
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </SimpleTooltip>
              )}
              {canEdit && !isEditing && !isArchived && (
                <SimpleTooltip content="Edit this post">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Seed the edit buffers from the current prop so the form
                      // starts from the live body even after a redo/restore
                      // changed it since this card mounted.
                      setCaption(post.caption)
                      setHashtags(post.hashtags.join(' '))
                      setGraphicHook(post.graphicHook ?? '')
                      setDesignerNotes(post.designerNotes ?? '')
                      setIsEditing(true)
                    }}
                  >
                    Edit
                  </Button>
                </SimpleTooltip>
              )}
              {canEdit && !isEditing && !isArchived && (
                <SimpleTooltip content="Regenerate this post's caption with AI">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRedoConfirmOpen(true)}
                    disabled={isPending}
                    aria-label="AI redo"
                  >
                    <Sparkles className="size-4" />
                    Redo
                  </Button>
                </SimpleTooltip>
              )}
            </div>
          )}
        </div>

        {!collapsed && (
          <div id={`post-body-${post.id}`} className="px-5">
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`caption-${post.id}`}>Caption</Label>
                  <Textarea
                    id={`caption-${post.id}`}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`hashtags-${post.id}`}>Hashtags</Label>
                  <Input
                    id={`hashtags-${post.id}`}
                    value={hashtags}
                    onChange={(e) => setHashtags(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`hook-${post.id}`}>Graphic hook</Label>
                    <Input
                      id={`hook-${post.id}`}
                      value={graphicHook}
                      onChange={(e) => setGraphicHook(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`notes-${post.id}`}>Designer notes</Label>
                    <Input
                      id={`notes-${post.id}`}
                      value={designerNotes}
                      onChange={(e) => setDesignerNotes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="accent" size="sm" onClick={handleSave} disabled={isPending}>
                    {isPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCaption(post.caption)
                      setHashtags(post.hashtags.join(' '))
                      setGraphicHook(post.graphicHook ?? '')
                      setDesignerNotes(post.designerNotes ?? '')
                      setIsEditing(false)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[15px] text-foreground whitespace-pre-line leading-relaxed break-words">
                  <Linkify text={post.caption} />
                </p>
                <QaEditedIndicator preQaCaption={post.preQaCaption} />
                {post.hashtags.length > 0 && (
                  <p className="text-[14px] text-neutral-500">{post.hashtags.join(' ')}</p>
                )}
                {post.graphicHook && (
                  <div className="rounded-xl bg-neutral-100/60 px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                      Graphic hook
                    </p>
                    <p className="text-[14px] text-foreground mt-1 break-words"><Linkify text={post.graphicHook} /></p>
                  </div>
                )}
                {post.designerNotes && (
                  <div className="rounded-xl bg-neutral-100/60 px-4 py-3">
                    <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                      Designer notes
                    </p>
                    <p className="text-[14px] text-foreground mt-1 break-words"><Linkify text={post.designerNotes} /></p>
                  </div>
                )}
              </div>
            )}

            {!isEditing && !isArchived && (canUploadMedia || mediaUrl) && (
              <div className="mt-4 space-y-2">
                <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                  Image
                </p>
                {canUploadMedia ? (
                  <MediaUpload
                    postId={post.id}
                    currentMediaUrl={mediaUrl}
                    onUploaded={() => router.refresh()}
                  />
                ) : (
                  mediaUrl && (
                    <div className="rounded-xl overflow-hidden border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaUrl}
                        alt="Post media"
                        data-testid="post-image-readonly"
                        className="w-full h-auto block"
                      />
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}

      </Card>

      <Dialog open={redoConfirmOpen} onOpenChange={setRedoConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Regenerate caption with AI?</DialogTitle>
            <DialogDescription>
              The current caption, hashtags, graphic hook, and designer
              notes will be replaced. Your current version stays in the
              post history so you can revert if the redo is worse.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRedoConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleRedo} disabled={isPending}>
              {isPending ? 'Regenerating…' : 'Redo with AI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
