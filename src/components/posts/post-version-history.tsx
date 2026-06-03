'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { History, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { restorePostVersionAction } from '@/server/actions/posts'
import { formatRelative } from '@/lib/format-relative'

export type PostVersionRow = {
  id: string
  caption: string
  hashtags: string[]
  graphicHook: string | null
  designerNotes: string | null
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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleRestore = (versionId: string) => {
    setPendingId(versionId)
    startTransition(async () => {
      await restorePostVersionAction(versionId)
      // Refresh so the restored body shows on the post immediately. The
      // server action also revalidates, but an explicit refresh keeps this
      // in parity with the redo flow and avoids any stale client view.
      router.refresh()
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
            {versions.map((v) => {
              const isExpanded = expandedId === v.id
              return (
                <li key={v.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : v.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`version-body-${v.id}`}
                      aria-label={`Toggle details for version from ${formatRelative(v.createdAt)}`}
                      className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                        <span aria-hidden="true" className="shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span>{formatRelative(v.createdAt)}</span>
                        {v.authorName && <span>· {v.authorName}</span>}
                        <span>
                          · {v.hashtags.length} tag{v.hashtags.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {!isExpanded && (
                        <p className="mt-1 line-clamp-1 text-[13px] text-foreground">
                          {v.caption || 'No caption'}
                        </p>
                      )}
                    </button>
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
                  </div>

                  {isExpanded && (
                    <div
                      id={`version-body-${v.id}`}
                      className="mt-3 space-y-3 pl-[1.375rem]"
                    >
                      <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground">
                        {v.caption || 'No caption'}
                      </p>
                      {v.hashtags.length > 0 && (
                        <p className="text-[13px] text-neutral-500">
                          {v.hashtags.join(' ')}
                        </p>
                      )}
                      {v.graphicHook && (
                        <div className="rounded-lg bg-neutral-100/60 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Graphic hook
                          </p>
                          <p className="mt-0.5 text-[13px] text-foreground">
                            {v.graphicHook}
                          </p>
                        </div>
                      )}
                      {v.designerNotes && (
                        <div className="rounded-lg bg-neutral-100/60 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                            Designer notes
                          </p>
                          <p className="mt-0.5 text-[13px] text-foreground">
                            {v.designerNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
