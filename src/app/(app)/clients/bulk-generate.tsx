'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge, StatusDot } from '@/components/ui/badge'
import { DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import { bulkGenerateContent } from './run-actions'
import { getClientCrawlInfo } from '@/app/(app)/clients/[id]/generate/actions'
import { useInFlightRuns } from '@/components/relay/in-flight-runs-provider'
import { stepLabel } from '@/components/relay/in-flight-runs-utils'
import { formatMonthYear } from '@/lib/batch-target-month'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  status: string
  industry: string | null
  location: string | null
  isArchived?: boolean
}

function getNextMonth(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BulkGenerateList({ clients }: { clients: Client[] }) {
  const [selected, setSelected] = useState<Map<string, { reCrawl: boolean }>>(new Map())
  const [targetMonth, setTargetMonth] = useState(getNextMonth)
  const [submittedRunIds, setSubmittedRunIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const { runs, refresh } = useInFlightRuns()
  const enrichedRef = useRef<Set<string>>(new Set())

  const activeClients = clients.filter((c) => c.status === 'active' && !c.isArchived)

  // Stable primitive derived from selected client IDs.
  // Keyed on IDs only so that toggleReCrawl (which changes values, not keys)
  // does not re-trigger the fetch effect unnecessarily.
  const selectedKeys = Array.from(selected.keys()).sort().join(',')

  // When a client is freshly selected, fetch its crawl defaults to set the initial Re-crawl state.
  // enrichedRef prevents re-fetching for the same client within the same session.
  useEffect(() => {
    let cancelled = false
    selected.forEach(async (_, clientId) => {
      if (enrichedRef.current.has(clientId)) return
      enrichedRef.current.add(clientId)
      const info = await getClientCrawlInfo(clientId)
      if (cancelled || !info) return
      const shouldCrawl =
        info.autoCrawl === 'always' ||
        (info.autoCrawl === 'when_empty' && !info.hasCrawledData)
      setSelected((prev) => {
        const next = new Map(prev)
        // Re-check it's still selected; user may have deselected in flight.
        if (!next.has(clientId)) return prev
        next.set(clientId, { reCrawl: shouldCrawl })
        return next
      })
    })
    return () => {
      cancelled = true
    }
    // `selected` is intentionally excluded: we only want to re-run when the set
    // of selected IDs changes, not when reCrawl values are toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys])

  const toggleClient = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
        enrichedRef.current.delete(id) // allow re-fetch if client is reselected later
      } else {
        // Default to reCrawl=true until the effect fetches the per-client preference.
        // The effect updates this to the client's actual preference on the next tick.
        next.set(id, { reCrawl: true })
      }
      return next
    })
  }

  const toggleReCrawl = (id: string) => {
    setSelected((prev) => {
      const next = new Map(prev)
      const existing = next.get(id)
      if (existing) next.set(id, { reCrawl: !existing.reCrawl })
      return next
    })
  }

  const allSelected = selected.size > 0 && selected.size === activeClients.length

  const allSelectedReCrawl =
    selected.size > 0 &&
    Array.from(selected.values()).every((s) => s.reCrawl)

  const selectAll = () => {
    if (allSelected) {
      setSelected(new Map())
    } else {
      setSelected(new Map(activeClients.map((c) => [c.id, { reCrawl: true }])))
    }
  }

  const toggleReCrawlAll = () => {
    if (selected.size === 0) return
    setSelected((prev) => {
      const next = new Map(prev)
      const targetValue = !allSelectedReCrawl
      next.forEach((_, clientId) => {
        next.set(clientId, { reCrawl: targetValue })
      })
      return next
    })
  }

  const handleBulkGenerate = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      const items = Array.from(selected.entries()).map(([clientId, { reCrawl }]) => ({ clientId, reCrawl }))
      const res = await bulkGenerateContent(items, targetMonth)
      const newIds = new Set(res.map((r) => r.contentRunId).filter((id): id is string => !!id))
      setSubmittedRunIds((prev) => new Set([...prev, ...newIds]))
      setSelected(new Map())
      await refresh()
    })
  }

  // Live progress derived from provider, filtered to this session's submissions.
  const myRuns = runs.filter((r) => submittedRunIds.has(r.id))

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <Card className="bg-cream-warm">
          <div className="px-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] font-semibold text-foreground">
              {selected.size} client{selected.size > 1 ? 's' : ''} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="h-10 rounded-xl border border-input bg-card px-3 text-[14px]"
              />
              <Button variant="accent" size="sm" onClick={handleBulkGenerate} disabled={isPending}>
                {isPending ? 'Submitting…' : `Generate ${formatMonthYear(targetMonth)} for ${selected.size}`}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {myRuns.length > 0 && (
        <Card>
          <div className="px-5 py-4">
            <p className="text-[14px] font-semibold mb-3">Your in-flight generations</p>
            <ul className="space-y-2">
              {myRuns.map((run) => (
                <li key={run.id} className="flex items-center justify-between text-[14px]">
                  <span className="font-medium">{run.clientName}</span>
                  <Badge variant={run.intent === 'failed' ? 'destructive' : 'primary'}>
                    {stepLabel(run)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {activeClients.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <button
            onClick={selectAll}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            {allSelected ? 'Deselect all' : 'Select all active'}
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            onClick={toggleReCrawlAll}
            disabled={selected.size === 0}
            className="text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground"
          >
            {allSelectedReCrawl ? 'Re-crawl none' : 'Re-crawl all'}
          </button>
        </div>
      )}

      <DataRowGroup>
        {clients.map((client) => {
          const subtitle = [client.industry, client.location].filter(Boolean).join(' · ') || 'No details set'
          const isArchived = Boolean(client.isArchived)
          const isSelectable = client.status === 'active' && !isArchived
          const isSelected = selected.has(client.id)
          const selection = selected.get(client.id)

          return (
            <div key={client.id} className={`flex items-center${isArchived ? ' opacity-50 grayscale' : ''}`}>
              <div className="pl-5 shrink-0 flex items-center gap-3">
                {isSelectable ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleClient(client.id)}
                    className="size-4 rounded border-input accent-foreground"
                    aria-label={`Select ${client.name}`}
                  />
                ) : (
                  <div className="size-4" />
                )}
                {isSelected && selection !== undefined && (
                  <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={selection.reCrawl}
                      onChange={() => toggleReCrawl(client.id)}
                      className="size-3.5 rounded border-input accent-foreground"
                      aria-label={`Re-crawl ${client.name}`}
                    />
                    Re-crawl
                  </label>
                )}
              </div>
              <Link
                href={`/clients/${client.id}`}
                className="flex-1 flex items-center gap-4 px-4 py-4 hover:bg-cream-warm/60"
              >
                <RowAvatar initials={client.name.slice(0, 2)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusDot status={isSelectable ? 'active' : 'inactive'} />
                    <span className="text-[15px] font-semibold text-foreground truncate">{client.name}</span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground truncate">{subtitle}</div>
                </div>
                {isArchived ? (
                  <Badge variant="secondary">archived</Badge>
                ) : !isSelectable ? (
                  <Badge variant="secondary">{client.status}</Badge>
                ) : null}
              </Link>
            </div>
          )
        })}
      </DataRowGroup>
    </div>
  )
}
