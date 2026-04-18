'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  apify: {
    computeUnits: number
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
    <Card className="p-4 sm:p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Cost Breakdown</h3>
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Details'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-xs text-blue-600 font-medium">OpenAI</p>
          <p className="text-lg font-bold text-blue-900">{fmt(breakdown.openai.total)}</p>
        </div>
        <div className="rounded-lg bg-purple-50 p-3">
          <p className="text-xs text-purple-600 font-medium">Anthropic</p>
          <p className="text-lg font-bold text-purple-900">{fmt(breakdown.anthropic.total)}</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-xs text-amber-600 font-medium">Apify</p>
          <p className="text-lg font-bold text-amber-900">{fmt(breakdown.apify.usd)}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-3">
          <p className="text-xs text-green-600 font-medium">Total</p>
          <p className="text-lg font-bold text-green-900">{fmt(breakdown.total)}</p>
          <p className="text-xs text-green-600">{breakdown.credits} credits</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 font-medium text-right">Tokens</th>
                <th className="pb-2 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2">
                  <span className="font-medium">GPT-4.1</span>
                  <span className="text-muted-foreground"> - Brief</span>
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {fmtTokens(breakdown.openai.brief.inputTokens)} in / {fmtTokens(breakdown.openai.brief.outputTokens)} out
                </td>
                <td className="py-2 text-right">{fmt(breakdown.openai.brief.usd)}</td>
              </tr>
              <tr>
                <td className="py-2">
                  <span className="font-medium">GPT-4.1</span>
                  <span className="text-muted-foreground"> - Facts</span>
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {fmtTokens(breakdown.openai.facts.inputTokens)} in / {fmtTokens(breakdown.openai.facts.outputTokens)} out
                </td>
                <td className="py-2 text-right">{fmt(breakdown.openai.facts.usd)}</td>
              </tr>
              <tr>
                <td className="py-2">
                  <span className="font-medium">Claude Opus 4</span>
                  <span className="text-muted-foreground"> - Captions</span>
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {fmtTokens(breakdown.anthropic.captions.inputTokens)} in / {fmtTokens(breakdown.anthropic.captions.outputTokens)} out
                </td>
                <td className="py-2 text-right">{fmt(breakdown.anthropic.captions.usd)}</td>
              </tr>
              <tr>
                <td className="py-2">
                  <span className="font-medium">Apify</span>
                  <span className="text-muted-foreground"> - Crawl ({breakdown.apify.urlsCrawled} URLs, {breakdown.apify.computeUnits.toFixed(3)} CU)</span>
                </td>
                <td className="py-2 text-right text-muted-foreground">-</td>
                <td className="py-2 text-right">{fmt(breakdown.apify.usd)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-2">
                  <span className="font-medium">Trigger.dev</span>
                  <span> - Compute ({pipelineDurationSeconds}s)</span>
                </td>
                <td className="py-2 text-right">-</td>
                <td className="py-2 text-right">{fmt(breakdown.infra.triggerDev)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-2">
                  <span className="font-medium">Vercel + Neon</span>
                  <span> - Functions + DB</span>
                </td>
                <td className="py-2 text-right">-</td>
                <td className="py-2 text-right">{fmt(breakdown.infra.vercel + breakdown.infra.neon)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td className="pt-3 font-medium">Subtotal</td>
                <td></td>
                <td className="pt-3 text-right">{fmt(breakdown.subtotal)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-1">Buffer (5% for untracked costs)</td>
                <td></td>
                <td className="py-1 text-right">{fmt(breakdown.infraBuffer)}</td>
              </tr>
              <tr className="font-bold text-foreground">
                <td className="pt-2">Total</td>
                <td></td>
                <td className="pt-2 text-right">{fmt(breakdown.total)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="py-1">Credits consumed</td>
                <td></td>
                <td className="py-1 text-right">{breakdown.credits}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
