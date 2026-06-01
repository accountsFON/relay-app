/**
 * ReviewSessionHeader: top section of the AM-side review session detail page.
 *
 * Shows reviewer identity, round number, formatted submitted timestamp (always
 * America/New_York since AM-side surfaces are agency-internal), and chip
 * summary counts for Approved / Changes Requested / Caption Edited.
 *
 * Spec: design doc § AM-side acceptance + plan Task 2.2.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ReviewSessionSummary } from '@/types/review-session'

export interface ReviewSessionHeaderProps {
  reviewerName: string
  reviewerEmail?: string | null
  round: number
  submittedAt: Date
  summary: ReviewSessionSummary
  backHref: string
}

function formatSubmittedAt(date: Date): string {
  // America/New_York is the agency's home timezone; AM-facing surfaces always
  // render in that zone so timestamps don't drift if an AM travels.
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return date.toISOString()
  }
}

export function ReviewSessionHeader({
  reviewerName,
  reviewerEmail,
  round,
  submittedAt,
  summary,
  backHref,
}: ReviewSessionHeaderProps) {
  return (
    <div
      className="space-y-4"
      data-testid="review-session-header"
    >
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        data-testid="review-session-back-link"
      >
        <ArrowLeft className="size-3.5" />
        <span>Back to relay</span>
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {reviewerName}
            </h1>
            <Badge variant="primary" data-testid="review-session-round-badge">
              Round {round}
            </Badge>
          </div>
          {reviewerEmail && (
            <p className="text-sm text-muted-foreground" data-testid="review-session-reviewer-email">
              {reviewerEmail}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground" data-testid="review-session-submitted-at">
            Submitted {formatSubmittedAt(submittedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="review-session-summary-chips">
        <SummaryChip
          label="Approved"
          count={summary.approved}
          tone="success"
          testId="summary-chip-approved"
        />
        <SummaryChip
          label="Changes"
          count={summary.changesRequested}
          tone="warning"
          testId="summary-chip-changes"
        />
        <SummaryChip
          label="Edits"
          count={summary.captionEdited}
          tone="info"
          testId="summary-chip-edits"
        />
      </div>
    </div>
  )
}

function SummaryChip({
  label,
  count,
  tone,
  testId,
}: {
  label: string
  count: number
  tone: 'success' | 'warning' | 'info'
  testId: string
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-green-50 text-green-900'
      : tone === 'warning'
        ? 'bg-coral-100 text-coral-500'
        : 'bg-blue-50 text-blue-900'

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${toneClass}`}
    >
      <span className="tabular-nums font-semibold">{count}</span>
      <span>{label}</span>
    </span>
  )
}
