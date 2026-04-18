'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { bulkGenerateContent } from './run-actions'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  status: string
  industry: string | null
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
      const res = await bulkGenerateContent(Array.from(selected), targetMonth)
      setResults(res)
      setSelected(new Set())
    })
  }

  return (
    <div>
      {selected.size > 0 && (
        <Card className="p-4 mb-4 border-primary/20 bg-primary/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">
              {selected.size} client{selected.size > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="border border-border rounded px-2 py-1 text-sm bg-background"
              />
              <Button
                size="sm"
                onClick={handleBulkGenerate}
                disabled={isPending}
              >
                {isPending
                  ? 'Generating...'
                  : `Generate ${formatMonth(targetMonth)} for ${selected.size}`}
              </Button>
              <Button
                variant="outline"
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
        <Card className="p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Bulk Generation Results</h3>
          <div className="space-y-1">
            {results.map((r) => (
              <div key={r.clientId} className="flex items-center justify-between text-sm">
                <span>{r.clientName}</span>
                {r.error ? (
                  <Badge className="bg-red-100 text-red-700">{r.error}</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-700">Queued</Badge>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setResults(null)}
          >
            Dismiss
          </Button>
        </Card>
      )}

      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={selectAll}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {selected.size === activeClients.length ? 'Deselect all' : 'Select all active'}
        </button>
      </div>

      <div className="space-y-2">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center gap-3"
          >
            {client.status === 'active' && (
              <input
                type="checkbox"
                checked={selected.has(client.id)}
                onChange={() => toggleClient(client.id)}
                className="h-4 w-4 rounded border-border shrink-0"
              />
            )}
            {client.status !== 'active' && <div className="w-4 shrink-0" />}
            <Link
              href={`/clients/${client.id}`}
              className="flex-1 flex items-center justify-between rounded-lg border border-border bg-card p-3 sm:p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{client.name}</p>
                {client.industry && (
                  <p className="text-sm text-muted-foreground">{client.industry}</p>
                )}
              </div>
              <Badge
                variant={client.status === 'active' ? 'default' : 'secondary'}
                className="shrink-0 ml-2"
              >
                {client.status}
              </Badge>
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
