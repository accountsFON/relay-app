import { Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Per-post approval indicator.
 *
 * Per design § Approval derivation: status is NOT stored on Post; the host
 * page derives it from `count(open threads)` server-side and passes the
 * result in via the `status` prop.
 *
 * - `ready` → green check icon (zero open threads on the post)
 * - `pending` → amber dot (one or more open threads)
 *
 * The badge is intentionally compact so it can sit beside the post header in
 * the preview shell without crowding it. A `title` attribute provides hover
 * context for AMs scanning a long batch.
 */
export type PostApprovalStatus = 'ready' | 'pending'

export interface PostApprovalBadgeProps {
  status: PostApprovalStatus
  /** Optional explicit open-thread count for the pending tooltip. */
  openThreadCount?: number
  className?: string
}

export function PostApprovalBadge({
  status,
  openThreadCount,
  className,
}: PostApprovalBadgeProps) {
  if (status === 'ready') {
    return (
      <span
        data-testid="post-approval-badge"
        data-status="ready"
        title="Ready: no open threads"
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900',
          className,
        )}
      >
        <Check className="size-3 shrink-0" aria-hidden="true" />
        <span>Ready</span>
      </span>
    )
  }

  const tooltip =
    openThreadCount && openThreadCount > 0
      ? `Pending: ${openThreadCount} open thread${openThreadCount === 1 ? '' : 's'}`
      : 'Pending: open thread'

  return (
    <span
      data-testid="post-approval-badge"
      data-status="pending"
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900',
        className,
      )}
    >
      <Circle
        className="size-2 shrink-0 fill-amber-500 text-amber-500"
        aria-hidden="true"
      />
      <span>Pending</span>
    </span>
  )
}
