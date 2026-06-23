'use client'

import { ApproveAllButton } from '@/components/review/approve-all-button'

/**
 * Condensed bar pinned to the top of the client review surface once the full
 * "Reviewing as / progress / Approve all" card scrolls out of view. One row:
 * compact progress on the left, the existing Approve all button on the right
 * (so the bulk-approve behavior — override confirm, disabled states — is
 * identical to the full card). The shell controls when this is mounted.
 */
export function ReviewStickyBar({
  reviewed,
  total,
  allApproved,
  pending,
  onApproveAll,
}: {
  reviewed: number
  total: number
  allApproved: boolean
  pending: boolean
  onApproveAll: () => void
}) {
  const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0
  return (
    <div
      data-testid="review-sticky-bar"
      className="fixed inset-x-0 top-0 z-20 border-b border-neutral-200 bg-white/95 shadow-sm backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-[880px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[12px] font-medium tabular-nums text-neutral-700">
            {reviewed}/{total} reviewed
          </span>
          <span
            aria-hidden
            className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-neutral-200"
          >
            <span
              className="block h-full rounded-full bg-neutral-800 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
        <ApproveAllButton
          totalPosts={total}
          allApproved={allApproved}
          pending={pending}
          onApproveAll={onApproveAll}
        />
      </div>
    </div>
  )
}
