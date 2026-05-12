'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge, StatusDot } from '@/components/ui/badge'
import { DataRow, DataRowGroup, RowAvatar } from '@/components/ui/data-row'
import { bulkGenerateContent } from './run-actions'
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

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function BulkGenerateList({ clients }: { clients: Client[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetMonth, setTargetMonth] = useState(getNextMonth)
  const [results, setResults] = useState<
    { clientId: string; clientName: string; contentRunId?: string; error?: string }[] | null
  >(null)
  const [isPending, startTransition] = useTransition()

  const activeClients = clients.filter((c) => c.status === 'active')

  const toggleClient = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === activeClients.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(activeClients.map((c) => c.id)))
    }
  }

  const handleBulkGenerate = () => {
    if (selected.size === 0) return
    setResults(null)
    startTransition(async () => {
      const items = Array.from(selected).map((clientId) => ({ clientId, reCrawl: true }))
      const res = await bulkGenerateContent(items, targetMonth)
      setResults(res)
      setSelected(new Set())
    })
  }

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
                className="h-10 rounded-xl border border-input bg-card px-3 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
              <Button
                variant="accent"
                size="sm"
                onClick={handleBulkGenerate}
                disabled={isPending}
              >
                {isPending
                  ? 'Generating…'
                  : `Generate ${formatMonth(targetMonth)} for ${selected.size}`}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {results && (
        <Card>
          <div className="px-5">
            <h3 className="text-[15px] font-semibold mb-3">Bulk generation results</h3>
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.clientId} className="flex items-center justify-between text-[14px]">
                  <span>{r.clientName}</span>
                  {r.error ? (
                    <Badge variant="destructive">{r.error}</Badge>
                  ) : (
                    <Badge variant="primary">Queued</Badge>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => setResults(null)}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {activeClients.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={selectAll}
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {selected.size === activeClients.length ? 'Deselect all' : 'Select all active'}
          </button>
        </div>
      )}

      <DataRowGroup>
        {clients.map((client) => {
          const subtitle = [client.industry, client.location].filter(Boolean).join(' · ') || 'No details set'
          const isArchived = Boolean(client.isArchived)
          const isSelectable = client.status === 'active' && !isArchived
          const isSelected = selected.has(client.id)

          return (
            <div
              key={client.id}
              className={`flex items-center${isArchived ? ' opacity-50 grayscale' : ''}`}
            >
              <div className="pl-5 shrink-0">
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
              </div>
              <Link
                href={`/clients/${client.id}`}
                className="flex-1 flex items-center gap-4 px-4 py-4 transition-colors hover:bg-cream-warm/60"
              >
                <RowAvatar initials={client.name.slice(0, 2)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusDot status={isSelectable ? 'active' : 'inactive'} />
                    <span className="text-[15px] font-semibold text-foreground truncate">
                      {client.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground truncate">
                    {subtitle}
                  </div>
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
