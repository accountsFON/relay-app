'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updatePostAction } from '@/server/actions/posts'
import { archivePostAction, restorePostAction } from '@/app/(app)/trash/actions'
import { cn } from '@/lib/utils'

type Post = {
  id: string
  postDate: Date
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
  deletedAt?: Date | null
}

export function PostCard({
  post,
  canEdit = false,
}: {
  post: Post
  canEdit?: boolean
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [hashtags, setHashtags] = useState(post.hashtags.join(' '))
  const [graphicHook, setGraphicHook] = useState(post.graphicHook ?? '')
  const [designerNotes, setDesignerNotes] = useState(post.designerNotes ?? '')
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)

  const isArchived = Boolean(post.deletedAt)

  const dateLabel = post.postDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const handleSave = () => {
    startTransition(async () => {
      await updatePostAction(post.id, {
        caption,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        graphicHook: graphicHook || null,
        designerNotes: designerNotes || null,
      })
      setIsEditing(false)
    })
  }

  const handleCopy = () => {
    const text = `${caption}\n\n${hashtags}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleArchive = () => {
    startTransition(async () => {
      await archivePostAction(post.id)
      router.refresh()
      setArchiveConfirmOpen(false)
    })
  }

  const handleRestore = () => {
    startTransition(async () => {
      await restorePostAction(post.id)
      router.refresh()
    })
  }

  const showOverflowMenu = canEdit

  return (
    <>
      <Card
        data-post-id={post.id}
        data-archived={isArchived ? '1' : undefined}
        className={cn(isArchived && 'opacity-50 grayscale pointer-events-none')}
      >
        {isArchived && (
          <div className="px-5 pt-3 pointer-events-auto">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          </div>
        )}

        <div className="px-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-semibold text-foreground">{dateLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            )}
            {!isEditing && !isArchived && (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
            {showOverflowMenu && (
              <div className="pointer-events-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Post options"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!isArchived && (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setArchiveConfirmOpen(true)}
                      >
                        Archive post
                      </DropdownMenuItem>
                    )}
                    {isArchived && (
                      <DropdownMenuItem onClick={handleRestore}>
                        Restore post
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        <div className="px-5">
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
              <p className="text-[15px] text-foreground whitespace-pre-line leading-relaxed">
                {caption}
              </p>
              {post.hashtags.length > 0 && (
                <p className="text-[14px] text-ink-50">{post.hashtags.join(' ')}</p>
              )}
              {post.graphicHook && (
                <div className="rounded-xl bg-cream-warm/60 px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    Graphic hook
                  </p>
                  <p className="text-[14px] text-foreground mt-1">{post.graphicHook}</p>
                </div>
              )}
              {post.designerNotes && (
                <div className="rounded-xl bg-cream-warm/60 px-4 py-3">
                  <p className="text-[12px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    Designer notes
                  </p>
                  <p className="text-[14px] text-foreground mt-1">{post.designerNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {isArchived && canEdit && (
          <div className="px-5 pb-4 pointer-events-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              disabled={isPending}
            >
              {isPending ? 'Restoring…' : 'Restore post'}
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive this post?</DialogTitle>
            <DialogDescription>
              It will move to trash and be permanently deleted in 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setArchiveConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleArchive}
              disabled={isPending}
            >
              {isPending ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
