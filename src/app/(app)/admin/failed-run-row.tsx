import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export interface FailedRunRowProps {
  run: {
    id: string
    clientId: string
    targetMonth: string
    errorMessage: string | null
    /**
     * Prisma's `Decimal` widens to unknown shapes here so the row component
     * accepts any of the common JS number representations (Decimal serializes
     * via toString / toNumber on the read side). We normalize via Number() in
     * the render path.
     */
    totalCostUsd: number | string | { toString: () => string } | null
    createdAt: Date
    startedAt: Date | null
    client: { id: string; name: string }
    _count: { posts: number }
  }
}

export function FailedRunRow({ run }: FailedRunRowProps) {
  const ageMs = Date.now() - new Date(run.createdAt).getTime()
  const ageLabel = formatAge(ageMs)
  const cost = run.totalCostUsd ? Number(run.totalCostUsd) : 0
  const monthLabel = formatMonth(run.targetMonth)
  const partial = run._count.posts > 0
  const errorPreview = (run.errorMessage ?? 'No error message captured').trim()

  return (
    <div className="flex items-start justify-between gap-4 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${run.clientId}/runs/${run.id}`}
          className="flex items-center gap-2 text-[14px] font-medium text-foreground hover:underline"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="truncate">
            {run.client.name} · {monthLabel}
          </span>
        </Link>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-destructive/90">
          {errorPreview}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Failed {ageLabel}
          {cost > 0 && ` · $${cost.toFixed(2)} burned`}
          {partial && ` · ${run._count.posts} partial post${run._count.posts === 1 ? '' : 's'}`}
        </p>
      </div>
      <Link
        href={`/clients/${run.clientId}/runs/${run.id}`}
        className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground hover:underline"
      >
        Inspect →
      </Link>
    </div>
  )
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1)
  return date.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function formatAge(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}
