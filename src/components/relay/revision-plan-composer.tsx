/**
 * RevisionPlanComposer: right-rail variant for step 11b (implementing_revisions).
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § State Machine,
 *       RevisionPlan dispatch (step 11b).
 *
 * Behavior:
 * - AM annotates the client's revision asks as discrete RevisionItems.
 * - Each item is tagged: copy / design / am_inline.
 * - On Dispatch: server creates RevisionPlan + items, fires events,
 *   notifies assignees. Items run in parallel.
 * - Once all items reach `complete`, batch auto-advances 11b -> 12.
 *
 * Assignee routing (V1):
 * - copy items → assignedAmId (the client's AM owns step 1)
 * - design items → assignedDesignerId
 * - am_inline items → meId (the AM acting on the composer)
 */
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RevisionItemType } from '@prisma/client'
import { Plus, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { dispatchRevisionsAction } from '@/server/actions/relay'
import type { BatchSummary } from './types'

interface DraftRevisionItem {
  /** Local UI key. Server assigns the real id on dispatch. */
  draftId: string
  type: RevisionItemType
  description: string
}

const TYPE_OPTIONS: { value: RevisionItemType; label: string; routesTo: string }[] = [
  { value: RevisionItemType.copy, label: 'Copy', routesTo: 'AM (step 1)' },
  { value: RevisionItemType.design, label: 'Design', routesTo: 'Designer (step 7)' },
  { value: RevisionItemType.am_inline, label: 'AM-inline', routesTo: 'You (no handoff)' },
]

export interface RevisionPlanComposerProps {
  batch: BatchSummary
  /** AM assigned to this client. Resolved server-side and passed in. */
  assignedAmId: string | null
  /** Designer assigned to this client. */
  assignedDesignerId: string | null
  /** The current AM acting on the composer (for am_inline items). */
  meId: string
}

export function RevisionPlanComposer({
  batch,
  assignedAmId,
  assignedDesignerId,
  meId,
}: RevisionPlanComposerProps) {
  const [draftItems, setDraftItems] = useState<DraftRevisionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function addItem() {
    setDraftItems((prev) => [
      ...prev,
      {
        draftId: crypto.randomUUID(),
        type: RevisionItemType.copy,
        description: '',
      },
    ])
  }

  function removeItem(id: string) {
    setDraftItems((prev) => prev.filter((i) => i.draftId !== id))
  }

  function updateItem(id: string, patch: Partial<DraftRevisionItem>) {
    setDraftItems((prev) =>
      prev.map((i) => (i.draftId === id ? { ...i, ...patch } : i)),
    )
  }

  /**
   * Resolve the assignee userId for an item type, returning null if the
   * client has no AM/designer assigned.
   */
  function resolveAssignee(type: RevisionItemType): string | null {
    switch (type) {
      case RevisionItemType.copy:
        return assignedAmId
      case RevisionItemType.design:
        return assignedDesignerId
      case RevisionItemType.am_inline:
        return meId
    }
  }

  const canDispatch =
    draftItems.length > 0 &&
    draftItems.every((i) => i.description.trim().length > 0) &&
    draftItems.every((i) => resolveAssignee(i.type) !== null)

  function dispatch() {
    if (!canDispatch) return
    setError(null)
    const payload: { type: RevisionItemType; description: string; assignedTo: string }[] = []
    for (const item of draftItems) {
      const assignedTo = resolveAssignee(item.type)
      if (!assignedTo) {
        setError(
          item.type === RevisionItemType.copy
            ? 'No AM assigned to this client.'
            : 'No designer assigned to this client.',
        )
        return
      }
      payload.push({
        type: item.type,
        description: item.description.trim(),
        assignedTo,
      })
    }
    startTransition(async () => {
      try {
        await dispatchRevisionsAction({ batchId: batch.id, items: payload })
        setDraftItems([])
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to dispatch revisions')
      }
    })
  }

  return (
    <Card size="sm" className="sticky top-4 px-4 py-4" data-component="revision-plan-composer">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Revision plan
        </p>
        <p className="text-[13px] text-muted-foreground">
          Annotate client asks. Copy items route to step 1, design items route to
          step 7, AM-inline items stay with you.
        </p>
      </div>

      <ul className="space-y-3">
        {draftItems.map((item) => {
          const assignee = resolveAssignee(item.type)
          return (
            <li
              key={item.draftId}
              className="space-y-2 rounded-md border border-border bg-background p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateItem(item.draftId, { type: opt.value })}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                        item.type === opt.value
                          ? 'bg-foreground text-neutral-50'
                          : 'bg-neutral-100 text-foreground',
                      )}
                      title={`Routes to: ${opt.routesTo}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.draftId)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove item"
                >
                  <X className="size-4" />
                </button>
              </div>
              <Input
                placeholder="Describe the revision (what the client said)"
                value={item.description}
                onChange={(e) => updateItem(item.draftId, { description: e.target.value })}
              />
              {assignee === null && (
                <p className="text-[11px] text-destructive">
                  {item.type === RevisionItemType.copy
                    ? 'No AM assigned to this client. Resolve before dispatch.'
                    : 'No designer assigned to this client. Resolve before dispatch.'}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={addItem} className="w-full">
          <Plus />
          Add item
        </Button>
        <Button
          type="button"
          disabled={!canDispatch || isPending}
          className="w-full"
          onClick={dispatch}
        >
          <Send />
          {isPending
            ? 'Dispatching…'
            : `Dispatch ${draftItems.length} item${draftItems.length === 1 ? '' : 's'}`}
        </Button>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </Card>
  )
}
