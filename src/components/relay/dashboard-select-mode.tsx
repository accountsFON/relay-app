'use client'

/**
 * DashboardSelectMode — Select-mode toggle + bulk archive for the My Relay
 * dashboard.
 *
 * Wraps the dashboard track and exposes selection state to descendants via
 * `SelectModeContext`. RelayRunnerCard reads the context to render its
 * checkbox and reflect selected state.
 *
 * UX shape:
 *   - Header has a Select button. Clicking enters select mode.
 *   - In select mode: checkboxes appear on cards, action bar appears at top
 *     with [N selected] [Select all visible] [Archive] [Cancel].
 *   - Archive opens a Yes/Cancel Dialog. Yes calls bulkArchiveBatchesAction.
 *   - Cancel (and Escape) exits select mode and clears selection.
 *   - Selection is ephemeral — refresh or route change clears it.
 *
 * Spec: projects/relay-app/2026-05-14-completed-step-and-bulk-archive-design.md
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { bulkArchiveBatchesAction } from '@/app/(app)/dashboard/actions'

/**
 * Minimal data the select-mode logic needs per relay. The dashboard page
 * derives this from the runner-card data it already loads.
 */
export interface SelectableRelay {
  id: string
  clientName?: string
  /** Already-archived relays are excluded from "Select all visible". */
  deletedAt: Date | string | null
}

interface SelectModeContextValue {
  isSelectMode: boolean
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
}

export const SelectModeContext = createContext<SelectModeContextValue | null>(null)

export function useSelectMode(): SelectModeContextValue | null {
  return useContext(SelectModeContext)
}

export function DashboardSelectMode({
  relays,
  children,
}: {
  relays: SelectableRelay[]
  children: React.ReactNode
}) {
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [archiving, startArchiving] = useTransition()
  const router = useRouter()

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setIsSelectMode(false)
    setSelectedIds(new Set())
    setArchiveError(null)
  }, [])

  const selectAllVisible = useCallback(() => {
    const visibleIds = relays.filter((r) => !r.deletedAt).map((r) => r.id)
    setSelectedIds(new Set(visibleIds))
  }, [relays])

  const handleConfirmArchive = useCallback(() => {
    setArchiveError(null)
    const ids = Array.from(selectedIds)
    startArchiving(async () => {
      try {
        const result = await bulkArchiveBatchesAction(ids)
        if (result.failed.length > 0) {
          setArchiveError(
            `Archived ${result.archivedCount} of ${ids.length}. ${result.failed.length} failed.`,
          )
          return
        }
        setConfirmOpen(false)
        setIsSelectMode(false)
        setSelectedIds(new Set())
        router.refresh()
      } catch (e) {
        setArchiveError(e instanceof Error ? e.message : 'Archive failed')
      }
    })
  }, [selectedIds, router])

  const value = useMemo(
    () => ({ isSelectMode, selectedIds, toggleSelect }),
    [isSelectMode, selectedIds, toggleSelect],
  )

  return (
    <SelectModeContext.Provider value={value}>
      <div className="mb-3">
        {!isSelectMode ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSelectMode(true)}
            className="gap-1.5"
          >
            <CheckSquare className="size-4" />
            Select
          </Button>
        ) : (
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <span className="text-[13px] text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button variant="ghost" size="sm" onClick={selectAllVisible}>
              Select all visible
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Archive
            </Button>
            <Button variant="ghost" size="sm" onClick={exitSelectMode}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      {children}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {selectedIds.size} runs?</DialogTitle>
            <DialogDescription>
              They will move to Trash and can be restored within 30 days from /admin/trash.
            </DialogDescription>
          </DialogHeader>
          {archiveError && (
            <p className="text-[13px] text-destructive">{archiveError}</p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={archiving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmArchive}
              disabled={archiving}
            >
              {archiving ? 'Archiving…' : 'Yes, archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SelectModeContext.Provider>
  )
}
