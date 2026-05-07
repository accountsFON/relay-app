'use client'

import * as React from 'react'
import { useState } from 'react'
import type { Client } from '@prisma/client'
import { ExternalLink, Link as LinkIcon } from 'lucide-react'
import { PageSection } from '@/components/ui/page-section'
import { cn } from '@/lib/utils'

const POSTING_DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function ClientProfileView({ client }: { client: Client }) {
  return (
    <div className="space-y-6">
      <PageSection title="Identity">
        <KeyValueGrid>
          <KeyValue label="Name" value={client.name} />
          <KeyValue label="Industry" value={client.industry} />
          <KeyValue label="Location" value={client.location} />
          <KeyValue label="Phone" value={client.phone} kind="phone" />
        </KeyValueGrid>
      </PageSection>

      <PageSection title="Brand">
        <FieldStack>
          <NarrativeField label="Business summary" value={client.businessSummary} />
          <NarrativeField label="Brand voice" value={client.brandVoice} />
          <NarrativeField label="Target audience" value={client.targetAudience} />
        </FieldStack>
      </PageSection>

      <PageSection title="Strategy">
        <div className="space-y-6">
          <NarrativeField label="Main CTA" value={client.mainCta} clampLines={6} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FocusCard index={1} value={client.focus1} />
            <FocusCard index={2} value={client.focus2} />
            <FocusCard index={3} value={client.focus3} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NarrativeField
              label="Dos"
              value={client.dos}
              clampLines={8}
              accent="default"
            />
            <NarrativeField
              label="Don'ts"
              value={client.donts}
              clampLines={8}
              accent="warning"
            />
          </div>
        </div>
      </PageSection>

      <PageSection title="Scheduling">
        <KeyValueGrid>
          <KeyValue label="Posting days" value={client.postingDays} kind="days" />
          <KeyValue label="Post length" value={client.postLength} />
          <KeyValue label="Holiday handling" value={client.holidayHandling} />
          <KeyValue
            label="Excluded dates"
            value={client.excludedDates.length ? client.excludedDates : null}
            kind="chips"
          />
        </KeyValueGrid>
      </PageSection>

      <PageSection title="Assets">
        <FieldStack>
          <UrlListField label="URLs" urls={client.urls} />
          <LinkField label="Assets folder" href={client.assetsFolderUrl} />
        </FieldStack>
      </PageSection>
    </div>
  )
}

// ---------- Layout helpers ----------

function KeyValueGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
      {children}
    </dl>
  )
}

function FieldStack({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border -my-5">
    {React.Children.map(children, (child, i) => (
      <div key={i} className="py-5">{child}</div>
    ))}
  </div>
}

// ---------- Field components ----------

function KeyValue({
  label,
  value,
  kind = 'text',
}: {
  label: string
  value: string | string[] | null | undefined
  kind?: 'text' | 'phone' | 'days' | 'chips'
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[15px] text-foreground">
        {renderValue(value, kind)}
      </dd>
    </div>
  )
}

function renderValue(
  value: string | string[] | null | undefined,
  kind: 'text' | 'phone' | 'days' | 'chips'
): React.ReactNode {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-ink-20">—</span>
  }

  if (kind === 'phone' && typeof value === 'string') {
    const tel = value.replace(/[^+\d]/g, '')
    return (
      <a href={`tel:${tel}`} className="hover:text-orange transition-colors">
        {value}
      </a>
    )
  }

  if (kind === 'days' && typeof value === 'string') {
    const days = value.split(',').map((d) => d.trim())
    return (
      <div className="flex flex-wrap gap-1.5">
        {POSTING_DAY_ORDER.map((d) => {
          const active = days.includes(d)
          return (
            <span
              key={d}
              className={cn(
                'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums',
                active
                  ? 'bg-foreground text-cream'
                  : 'bg-cream-warm text-ink-20 line-through decoration-1'
              )}
            >
              {d}
            </span>
          )
        })}
      </div>
    )
  }

  if (kind === 'chips' && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => (
          <span
            key={v}
            className="inline-flex h-7 items-center rounded-full bg-cream-warm px-3 text-[13px] tabular-nums text-foreground"
          >
            {v}
          </span>
        ))}
      </div>
    )
  }

  return typeof value === 'string' ? value : value.join(', ')
}

function NarrativeField({
  label,
  value,
  clampLines = 6,
  accent = 'default',
}: {
  label: string
  value: string | null | undefined
  clampLines?: number
  accent?: 'default' | 'warning'
}) {
  const [expanded, setExpanded] = useState(false)
  const lines = value?.split('\n').length ?? 0
  const isLong = lines > clampLines || (value?.length ?? 0) > clampLines * 70
  const showClamp = isLong && !expanded

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </h3>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[12px] font-medium text-orange hover:underline shrink-0"
          >
            {expanded ? 'Show less' : 'Show full'}
          </button>
        )}
      </div>
      {value ? (
        <div
          className={cn(
            'rounded-xl px-4 py-3 text-[14px] leading-relaxed text-foreground whitespace-pre-wrap',
            accent === 'warning' ? 'bg-cream-warm/60' : 'bg-cream-warm/60'
          )}
          style={
            showClamp
              ? {
                  display: '-webkit-box',
                  WebkitLineClamp: clampLines,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }
              : undefined
          }
        >
          <Linkified text={value} />
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 text-[14px] text-ink-20">—</div>
      )}
    </div>
  )
}

function FocusCard({ index, value }: { index: number; value: string | null | undefined }) {
  return (
    <div className="rounded-xl bg-cream-warm/60 px-4 py-4 h-full">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-cream tabular-nums">
          {index}
        </span>
        <span className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          Focus
        </span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
        {value || <span className="text-ink-20">—</span>}
      </p>
    </div>
  )
}

function UrlListField({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </h3>
      {urls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-cream-warm px-3 h-8 text-[13px] text-foreground hover:bg-cream-80 transition-colors max-w-full"
            >
              <LinkIcon className="size-3.5 shrink-0 text-ink-50" />
              <span className="truncate">{prettyUrl(url)}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-ink-20">—</p>
      )}
    </div>
  )
}

function LinkField({ label, href }: { label: string; href: string | null | undefined }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </h3>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[14px] text-foreground hover:text-orange transition-colors max-w-full"
        >
          <span className="truncate">{prettyUrl(href)}</span>
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : (
        <p className="text-[14px] text-ink-20">—</p>
      )}
    </div>
  )
}

// ---------- Utilities ----------

function prettyUrl(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.host + (u.pathname === '/' ? '' : u.pathname)
  } catch {
    return url
  }
}

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g
const PHONE_RE = /(\(\d{3}\)\s?\d{3}-\d{4}|\d{3}-\d{3}-\d{4}|\(\d{3}\)\s?[A-Z]{3}-[A-Z0-9]{4})/g

function Linkified({ text }: { text: string }) {
  const tokens: { type: 'text' | 'url' | 'phone'; value: string }[] = []
  let cursor = 0
  const matches: { index: number; length: number; type: 'url' | 'phone'; value: string }[] = []

  for (const m of text.matchAll(URL_RE)) {
    if (m.index !== undefined) matches.push({ index: m.index, length: m[0].length, type: 'url', value: m[0] })
  }
  for (const m of text.matchAll(PHONE_RE)) {
    if (m.index !== undefined) matches.push({ index: m.index, length: m[0].length, type: 'phone', value: m[0] })
  }
  matches.sort((a, b) => a.index - b.index)

  for (const m of matches) {
    if (m.index < cursor) continue
    if (m.index > cursor) tokens.push({ type: 'text', value: text.slice(cursor, m.index) })
    tokens.push({ type: m.type, value: m.value })
    cursor = m.index + m.length
  }
  if (cursor < text.length) tokens.push({ type: 'text', value: text.slice(cursor) })

  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'url') {
          const href = t.value.startsWith('http') ? t.value : `https://${t.value}`
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange hover:underline break-all"
            >
              {t.value}
            </a>
          )
        }
        if (t.type === 'phone') {
          const tel = t.value.replace(/[^+\d]/g, '')
          return (
            <a key={i} href={`tel:${tel}`} className="text-orange hover:underline">
              {t.value}
            </a>
          )
        }
        return <span key={i}>{t.value}</span>
      })}
    </>
  )
}

