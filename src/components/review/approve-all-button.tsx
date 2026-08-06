'use client'

import { Button } from '@/components/ui/button'
import { SimpleTooltip, InfoHint } from '@/components/relay/relay-tooltips'
import { CLIENT_REVIEW_TOOLTIP_COPY } from '@/lib/client-review-tooltip-copy'

/**
 * Bulk-approve CTA for the client review surface. Presentational: the shell
 * owns the approve-all logic (the optional override confirm + the per-post
 * persist). Hidden for a single post (the per-post Approve suffices), disabled
 * when there is nothing to approve or while a bulk approve / submit is running.
 */
export function ApproveAllButton({
  totalPosts,
  allApproved,
  pending,
  onApproveAll,
}: {
  totalPosts: number
  allApproved: boolean
  pending: boolean
  onApproveAll: () => void
}) {
  if (totalPosts <= 1) return null
  return (
    <SimpleTooltip content={CLIENT_REVIEW_TOOLTIP_COPY.approveAll}>
      <Button
        type="button"
        variant="default"
        size="sm"
        data-testid="approve-all-button"
        disabled={pending || allApproved}
        onClick={onApproveAll}
        className="self-start"
      >
        {pending ? 'Approving…' : `Approve all ${totalPosts} posts`}
        <InfoHint />
      </Button>
    </SimpleTooltip>
  )
}
