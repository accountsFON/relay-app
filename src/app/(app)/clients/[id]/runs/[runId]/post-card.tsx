'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { updatePostAction, updatePostStatusAction } from './actions'

type Post = {
  id: string
  postDate: Date
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
  approvalStatus: string
}

const STATUS_OPTIONS = ['draft', 'approved', 'scheduled'] as const

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  am_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
}

export function PostCard({ post }: { post: Post }) {
  const [isEditing, setIsEditing] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [hashtags, setHashtags] = useState(post.hashtags.join(' '))
  const [graphicHook, setGraphicHook] = useState(post.graphicHook ?? '')
  const [designerNotes, setDesignerNotes] = useState(post.designerNotes ?? '')
  const [status, setStatus] = useState(post.approvalStatus)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

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

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
    startTransition(async () => {
      await updatePostStatusAction(post.id, newStatus)
    })
  }

  const handleCopy = () => {
    const text = `${caption}\n\n${hashtags}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">{dateLabel}</span>
          <Badge className={STATUS_COLORS[status] ?? STATUS_COLORS.draft}>
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Hashtags</label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mt-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Graphic Hook</label>
              <input
                value={graphicHook}
                onChange={(e) => setGraphicHook(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Designer Notes</label>
              <input
                value={designerNotes}
                onChange={(e) => setDesignerNotes(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outline"
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
        <div>
          <p className="text-sm text-foreground whitespace-pre-line mb-3">
            {caption}
          </p>
          <p className="text-sm text-blue-600 mb-3">{post.hashtags.join(' ')}</p>
          {post.graphicHook && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Graphic Hook:</span> {post.graphicHook}
            </p>
          )}
          {post.designerNotes && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Designer Notes:</span> {post.designerNotes}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
