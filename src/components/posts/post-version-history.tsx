'use client'

import { useState, useTransition } from 'react'
import { History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { restorePostVersionAction } from '@/server/actions/posts'
import { formatRelative } from '@/lib/format-relative'

export type PostVersionRow = {
  id: string
  caption: string
  hashtagCount: number
  createdAt: Date
  authorName: string | null
}

export function PostVersionHistory({
  postId,
  versions,
}: {
  postId: string
  versions: PostVersionRow[]
}) {
  const [open, setOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [_, startTransition] = useTransition()

  const handleRestore = (versionId: string) => {
    setPendingId(versionId)
    startTransition(async () => {
      await restorePostVersionAction(versionId)
      setPendingId(null)
      setOpen(false)
    })
  }

  if (versions.length === 0) {
    return null
  }

  return (
    <div className="px-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-muted-foreground hover:bg-neutral-100 hover:text-foreground"
        aria-expanded={open}
        aria-controls={`versions-${postId}`}
      >
        <History className="h-3.5 w-3.5" />
        {open ? 'Hide history' : `${versions.length} version${versions.length === 1 ? '' : 's'}`}
      </button>
      {open && (
        <Card id={`versions-${postId}`} className="mt-2 p-0">
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-[12px] text-muted-foreground">
                    <span>{formatRelative(v.createdAt)}</span>
                    {v.authorName && <span>· {v.authorName}</span>}
                    <span>· {v.hashtagCount} tag{v.hashtagCount === 1 ? '' : 's'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-foreground">
                    {v.caption}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRestore(v.id)}
                  disabled={pendingId === v.id}
                  className="shrink-0"
                  aria-label={`Restore version from ${formatRelative(v.createdAt)}`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {pendingId === v.id ? 'Restoring…' : 'Restore'}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

