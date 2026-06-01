'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2Icon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandCheckbox } from '@/components/ui/brand-checkbox'
import { Badge } from '@/components/ui/badge'
import { TypedConfirmModal } from '@/components/admin/typed-confirm-modal'
import {
  purgeEntityAction,
  restoreClientAction,
  restoreBatchAction,
  restoreContentRunAction,
  restorePostAction,
} from '@/app/(app)/trash/actions'
import type { TrashEntityType } from '@/server/repositories/trashAuditLogs'
import { cn } from '@/lib/utils'
import { SimpleTooltip } from '@/components/relay/relay-tooltips'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrashRow {
  id: string
  /** Human-readable label shown in the table and used as the typed-confirm string. */
  label: string
  /** Display name of the user who archived the entity. */
  archivedBy: string | null
  /** ISO string from deletedAt. */
  archivedAt: string
  /** Days remaining before the 30-day purge window closes. */
  daysUntilPurge: number
}

interface Props {
  entityType: TrashEntityType
  rows: TrashRow[]
}

// ---------------------------------------------------------------------------
// Restore helpers (entity-type dispatch)
// ---------------------------------------------------------------------------

async function restoreEntity(entityType: TrashEntityType, id: string): Promise<void> {
  switch (entityType) {
    case 'client':
      return restoreClientAction(id)
    case 'batch':
      return restoreBatchAction(id)
    case 'contentRun':
      return restoreContentRunAction(id)
    case 'post':
      return restorePostAction(id)
  }
}

// ---------------------------------------------------------------------------
// RowActions — isolated per-row component so transitions don't bleed
// ---------------------------------------------------------------------------

function RowActions({
  row,
  entityType,
  onPurged,
}: {
  row: TrashRow
  entityType: TrashEntityType
  onPurged: (id: string) => void
}) {
  const router = useRouter()
  const [restorePending, startRestoreTransition] = useTransition()
  const [purgePending, startPurgeTransition] = useTransition()
  const [purgeOpen, setPurgeOpen] = useState(false)

  function handleRestore() {
    startRestoreTransition(async () => {
      await restoreEntity(entityType, row.id)
      router.refresh()
    })
  }

  async function handlePurge() {
    await purgeEntityAction(entityType, row.id)
    onPurged(row.id)
    router.refresh()
  }

  const isPending = restorePending || purgePending

  return (
    <div className="flex items-center gap-2">
      <SimpleTooltip content="Restore this row to active.">
        <Button
          variant="outline"
          size="xs"
          onClick={handleRestore}
          disabled={isPending}
          aria-label={`Restore ${row.label}`}
        >
          <RotateCcwIcon />
          Restore
        </Button>
      </SimpleTooltip>

      <SimpleTooltip content="Permanently delete this row. This cannot be undone.">
        <Button
          variant="destructive"
          size="xs"
          onClick={() => setPurgeOpen(true)}
          disabled={isPending}
          aria-label={`Permanently delete ${row.label}`}
        >
          <Trash2Icon />
          Delete forever
        </Button>
      </SimpleTooltip>

      <TypedConfirmModal
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={`Permanently delete?`}
        message={`This will permanently delete "${row.label}" and all its data. This cannot be undone.`}
        confirmString={row.label}
        onConfirm={handlePurge}
        destructive
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// TrashTable
// ---------------------------------------------------------------------------

/**
 * TrashTable: renders a single entity type's archived rows with:
 *   - Bulk select + bulk permanent delete
 *   - Per-row Restore and single permanent delete
 *   - Days-until-purge badge (red at <= 7 days)
 *
 * All data is passed as plain serialized TrashRow objects from the server
 * component; this component manages only local UI state (selection, modals).
 */
export function TrashTable({ entityType, rows: initialRows }: Props) {
  const router = useRouter()
  // Mirror rows locally so we can remove entries client-side after purge
  // without waiting for a full server refresh (belt-and-suspenders UX).
  const [rows, setRows] = useState<TrashRow[]>(initialRows)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false)
  const [bulkPurgePending, startBulkPurgeTransition] = useTransition()

  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rows.map((r) => r.id)))
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleRowPurged(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleBulkPurge() {
    const ids = Array.from(selected)
    // Purge one at a time — the action only accepts a single ID.
    for (const id of ids) {
      await purgeEntityAction(entityType, id)
    }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)))
    setSelected(new Set())
    router.refresh()
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Nothing in trash for this category.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {someSelected || allSelected ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? 'item' : 'items'} selected
          </span>
          <SimpleTooltip content="Permanently delete every selected row. This cannot be undone.">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkPurgeOpen(true)}
              disabled={bulkPurgePending}
            >
              <Trash2Icon />
              Permanently delete ({selected.size})
            </Button>
          </SimpleTooltip>

          <TypedConfirmModal
            open={bulkPurgeOpen}
            onOpenChange={setBulkPurgeOpen}
            title={`Permanently delete ${selected.size} ${selected.size === 1 ? 'item' : 'items'}?`}
            message={`This will permanently delete ${selected.size} ${selected.size === 1 ? 'item' : 'items'} and all associated data. This cannot be undone.`}
            confirmString={String(selected.size)}
            onConfirm={handleBulkPurge}
            destructive
          />
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-2">
                <BrandCheckbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Archived by</th>
              <th className="px-4 py-2">Archived date</th>
              <th className="px-4 py-2">Purge window</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id)
              const urgent = row.daysUntilPurge <= 7
              const archivedDate = new Date(row.archivedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors',
                    isSelected && 'bg-muted/20',
                  )}
                >
                  <td className="px-4 py-3">
                    <BrandCheckbox
                      checked={isSelected}
                      onChange={() => toggleRow(row.id)}
                      aria-label={`Select ${row.label}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.archivedBy ?? 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{archivedDate}</td>
                  <td className="px-4 py-3">
                    {row.daysUntilPurge === 0 ? (
                      <Badge variant="destructive">Purge overdue</Badge>
                    ) : (
                      <Badge variant={urgent ? 'destructive' : 'secondary'}>
                        {row.daysUntilPurge}d left
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions
                      row={row}
                      entityType={entityType}
                      onPurged={handleRowPurged}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
