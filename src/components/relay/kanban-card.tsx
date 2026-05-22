'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import type { RelayStep } from '@prisma/client'
import { STEP_LABEL } from './labels'
import {
  deriveSubStatus,
  type BatchForSubStatus,
} from '@/lib/batch-sub-status'
import {
  getStepColor,
  STEP_COLOR_CLASSES,
} from '@/lib/relay-step-colors'
import { cn } from '@/lib/utils'
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
import { Button } from '@/components/ui/button'
import {
  archiveBatchAction,
  restoreBatchAction,
} from '@/app/(app)/trash/actions'

export interface KanbanCardData extends BatchForSubStatus {
  id: string
  clientId: string
  label: string
  client: { name: string }
  holder: { name: string }
  currentStep: RelayStep
  deletedAt?: Date | null
}

export function KanbanCard({ batch }: { batch: KanbanCardData }) {
  const router = useRouter()
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const sub = deriveSubStatus(batch)
  const isArchived = Boolean(batch.deletedAt)
  const href = `/clients/${batch.clientId}/batches/${batch.id}`
  const accentBorder = STEP_COLOR_CLASSES[getStepColor(batch.currentStep)].leftBorder

  function navigate() {
    router.push(href)
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveBatchAction(batch.id)
      setArchiveConfirmOpen(false)
    })
  }

  function handleRestore() {
    startTransition(async () => {
      await restoreBatchAction(batch.id)
    })
  }

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        onClick={navigate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            navigate()
          }
        }}
        data-archived={isArchived ? 'true' : undefined}
        className={cn(
          'block rounded-xl border border-border border-l-4 bg-white px-3 py-2.5 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          accentBorder,
          isArchived && 'opacity-60',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-foreground truncate">
            {batch.client.name}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {isArchived && (
              <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Archived
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="Batch options"
                className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {!isArchived && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setArchiveConfirmOpen(true)}
                  >
                    Archive batch
                  </DropdownMenuItem>
                )}
                {isArchived && (
                  <DropdownMenuItem
                    onClick={handleRestore}
                    disabled={isPending}
                  >
                    Restore batch
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {batch.label} · {STEP_LABEL[batch.currentStep]}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className={
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ' +
              toneClass(sub.tone)
            }
          >
            {sub.label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {sub.daysHere}d
          </span>
        </div>
      </div>

      <Dialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive this batch?</DialogTitle>
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

function toneClass(
  tone: 'neutral' | 'progress' | 'attention' | 'success',
): string {
  switch (tone) {
    case 'success':
      return 'bg-cream-warm text-foreground'
    case 'attention':
      return 'bg-cream-warm text-ink-80'
    case 'progress':
      return 'bg-cream-80 text-ink-80'
    default:
      return 'bg-muted text-muted-foreground'
  }
}
