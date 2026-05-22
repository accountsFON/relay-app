'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Breakdown = {
  openai: {
    brief: { inputTokens: number; outputTokens: number; usd: number }
    facts: { inputTokens: number; outputTokens: number; usd: number }
    total: number
  }
  anthropic: {
    captions: { inputTokens: number; outputTokens: number; usd: number }
    total: number
  }
  crawl: {
    credits: number
    urlsCrawled: number
    usd: number
  }
  infra: {
    triggerDev: number
    vercel: number
    neon: number
    total: number
  }
  subtotal: number
  infraBuffer: number
  total: number
  credits: number
}

function fmt(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function CostBreakdown({
  breakdown,
  pipelineDurationSeconds,
}: {
  breakdown: Breakdown | null
  pipelineDurationSeconds: number | null
}) {
  const [expanded, setExpanded] = useState(false)

  if (!breakdown) {
    return null
  }

  return (
    <Card>
      <div className="px-5 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Cost breakdown
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Details'}
        </Button>
      </div>

      <div className="px-5">
        <CostTileGrid
          openaiCostUsd={breakdown.openai.total}
          anthropicCostUsd={breakdown.anthropic.total}
          firecrawlCostUsd={breakdown.crawl.usd}
          totalCostUsd={breakdown.total}
          credits={breakdown.credits}
        />
      </div>

      {expanded && (
        <div className="px-5 pt-4 border-t border-border">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="pb-3 font-semibold">Service</th>
                <th className="pb-3 font-semibold text-right">Tokens</th>
                <th className="pb-3 font-semibold text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3">
                  <span className="font-semibold">GPT-4.1</span>
                  <span className="text-muted-foreground"> · Brief</span>
                </td>
                <td className="py-3 text-right text-muted-foreground tabular-nums">
                  {fmtTokens(breakdown.openai.brief.inputTokens)} in / {fmtTokens(breakdown.openai.brief.outputTokens)} out
                </td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.openai.brief.usd)}</td>
              </tr>
              <tr>
                <td className="py-3">
                  <span className="font-semibold">GPT-4.1</span>
                  <span className="text-muted-foreground"> · Facts</span>
                </td>
                <td className="py-3 text-right text-muted-foreground tabular-nums">
                  {fmtTokens(breakdown.openai.facts.inputTokens)} in / {fmtTokens(breakdown.openai.facts.outputTokens)} out
                </td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.openai.facts.usd)}</td>
              </tr>
              <tr>
                <td className="py-3">
                  <span className="font-semibold">Claude Opus 4</span>
                  <span className="text-muted-foreground"> · Captions</span>
                </td>
                <td className="py-3 text-right text-muted-foreground tabular-nums">
                  {fmtTokens(breakdown.anthropic.captions.inputTokens)} in / {fmtTokens(breakdown.anthropic.captions.outputTokens)} out
                </td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.anthropic.captions.usd)}</td>
              </tr>
              <tr>
                <td className="py-3">
                  <span className="font-semibold">Firecrawl</span>
                  <span className="text-muted-foreground"> · Crawl ({breakdown.crawl.urlsCrawled} URLs, {breakdown.crawl.credits} credits)</span>
                </td>
                <td className="py-3 text-right text-muted-foreground">—</td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.crawl.usd)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-3">
                  <span className="font-semibold">Trigger.dev</span>
                  <span> · Compute ({pipelineDurationSeconds}s)</span>
                </td>
                <td className="py-3 text-right">—</td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.infra.triggerDev)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-3">
                  <span className="font-semibold">Vercel + Neon</span>
                  <span> · Functions + DB</span>
                </td>
                <td className="py-3 text-right">—</td>
                <td className="py-3 text-right tabular-nums">{fmt(breakdown.infra.vercel + breakdown.infra.neon)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-4 font-semibold">Subtotal</td>
                <td></td>
                <td className="pt-4 text-right tabular-nums">{fmt(breakdown.subtotal)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-1">Buffer (5% for untracked costs)</td>
                <td></td>
                <td className="py-1 text-right tabular-nums">{fmt(breakdown.infraBuffer)}</td>
              </tr>
              <tr className="font-bold text-foreground">
                <td className="pt-2 text-[15px]">Total</td>
                <td></td>
                <td className="pt-2 text-right tabular-nums text-[15px]">{fmt(breakdown.total)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-1">Credits consumed</td>
                <td></td>
                <td className="py-1 text-right tabular-nums">{breakdown.credits}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}

type Tint = 'blue' | 'coral' | 'yellow' | 'ink'

const tileBgMap: Record<Tint, string> = {
  blue: 'bg-blue-100 text-foreground',
  coral: 'bg-coral-100 text-foreground',
  yellow: 'bg-yellow-100 text-foreground',
  ink: 'bg-neutral-900 text-white',
}

const dotMap: Record<Tint, string> = {
  blue: 'bg-blue-500',
  coral: 'bg-coral-500',
  yellow: 'bg-yellow-500',
  ink: 'bg-white',
}

export function CostTileGrid({
  openaiCostUsd,
  anthropicCostUsd,
  firecrawlCostUsd,
  totalCostUsd,
  credits,
}: {
  openaiCostUsd: number
  anthropicCostUsd: number
  firecrawlCostUsd: number
  totalCostUsd: number
  credits: number
}) {
  const tiles: Array<{ label: string; value: string; tint: Tint; subtitle?: string }> = [
    { label: 'OPENAI', value: fmt(openaiCostUsd), tint: 'blue' },
    { label: 'ANTHROPIC', value: fmt(anthropicCostUsd), tint: 'coral' },
    { label: 'FIRECRAWL', value: fmt(firecrawlCostUsd), tint: 'yellow' },
    { label: 'TOTAL', value: fmt(totalCostUsd), tint: 'ink', subtitle: `${credits} credits` },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className={cn('rounded-2xl p-5', tileBgMap[tile.tint])}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', dotMap[tile.tint])} />
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
              {tile.label}
            </span>
          </div>
          <div className="text-2xl font-bold tabular-nums">{tile.value}</div>
          {tile.subtitle && (
            <div className="mt-1 text-xs tabular-nums opacity-70">{tile.subtitle}</div>
          )}
        </div>
      ))}
    </div>
  )
}
