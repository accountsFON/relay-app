/**
 * RevisionPlanComposer — right-rail variant for step 11b (implementing_revisions).
 *
 * Spec: projects/relay-app/2026-05-09-relay-workflow-design.md § State Machine,
 *       RevisionPlan dispatch (step 11b).
 *
 * Behavior (V1):
 * - AM annotates the client's revision asks as discrete RevisionItems.
 * - Each item is tagged: copy / design / am_inline.
 * - On Dispatch: server creates RevisionPlan + items, fires events,
 *   notifies assignees. Items run in parallel.
 * - Once all items reach `complete`, batch auto-advances 11b -> 12.
 *
 * Phase: shell now. Phase 3 wires dispatchRevisionsAction.
 * Schema dep: RevisionItem[] shape, dispatchRevisionsAction (Rails-owned).
 */
'use client'

import { useState } from 'react'
import { RevisionItemType } from '@prisma/client'
import { Plus, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { BatchSummary } from './types'

interface DraftRevisionItem {
  /** Local UI key. Server assigns the real id on dispatch. */
  draftId: string
  type: RevisionItemType
  description: string
  /** userId of the assignee. Inferred from type but overridable. */
  assignedTo: string
}

const TYPE_OPTIONS: { value: RevisionItemType; label: string; routesTo: string }[] = [
  { value: RevisionItemType.copy, label: 'Copy', routesTo: 'AM (step 1)' },
  { value: RevisionItemType.design, label: 'Design', routesTo: 'Designer (step 7)' },
  { value: RevisionItemType.am_inline, label: 'AM-inline', routesTo: 'You (no handoff)' },
]

export interface RevisionPlanComposerProps {
  batch: BatchSummary
  /** Roster used to assign am_inline / override defaults. */
  assignees?: { id: string; name: string; role: string }[]
}

export function RevisionPlanComposer({
  batch,
  assignees = [],
}: RevisionPlanComposerProps) {
  const [draftItems, setDraftItems] = useState<DraftRevisionItem[]>([])

  function addItem() {
    setDraftItems((prev) => [
      ...prev,
      {
        draftId: crypto.randomUUID(),
        type: RevisionItemType.copy,
        description: '',
        assignedTo: '',
      },
    ])
  }

  function removeItem(id: string) {
    setDraftItems((prev) => prev.filter((i) => i.draftId !== id))
  }

  function updateItem(id: string, patch: Partial<DraftRevisionItem>) {
    setDraftItems((prev) => prev.map((i) => (i.draftId === id ? { ...i, ...patch } : i)))
  }

  const canDispatch =
    draftItems.length > 0 && draftItems.every((i) => i.description.trim().length > 0)

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
        {draftItems.map((item) => (
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
                        ? 'bg-foreground text-cream'
                        : 'bg-cream-warm text-foreground'
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
            {/* TODO Phase 3: assignee select for am_inline overrides */}
            {item.type === RevisionItemType.am_inline && assignees.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                TODO: assignee picker (am_inline)
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={addItem} className="w-full">
          <Plus />
          Add item
        </Button>
        <Button
          type="button"
          disabled={!canDispatch}
          className="w-full"
          onClick={() => {
            // TODO Phase 3: dispatchRevisionsAction(batch.id, draftItems)
            console.log('TODO: dispatchRevisionsAction', batch.id, draftItems)
          }}
        >
          <Send />
          Dispatch {draftItems.length} item{draftItems.length === 1 ? '' : 's'}
        </Button>
      </div>
    </Card>
  )
}
