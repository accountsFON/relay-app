'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TrashTable } from '@/components/admin/trash-table'
import type { TrashRow } from '@/components/admin/trash-table'
import type { TrashEntityType } from '@/server/repositories/trashAuditLogs'

export interface TrashTabEntry {
  key: string
  label: string
  count: number
  rows: TrashRow[]
  entityType: TrashEntityType
}

interface Props {
  tabs: TrashTabEntry[]
}

/**
 * TrashTabsClient — client component for the tab switcher on /admin/trash.
 *
 * Manages the active tab index via useState. Each tab renders a TrashTable
 * that is mount-preserved (display:none) once visited so selections are not
 * lost when switching tabs.
 */
export function TrashTabsClient({ tabs }: Props) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? 'clients')

  return (
    <div>
      {/* Tab strip */}
      <nav className="flex flex-wrap gap-1.5 border-b border-border pb-3" aria-label="Trash categories">
        {tabs.map((tab) => {
          const active = tab.key === activeKey
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-cream-warm text-ink-50 hover:bg-cream-80 hover:text-foreground',
              )}
              aria-pressed={active}
            >
              {tab.label}
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                  active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Tab panels */}
      <div className="mt-6">
        {tabs.map((tab) => (
          <div key={tab.key} hidden={tab.key !== activeKey}>
            <TrashTable entityType={tab.entityType} rows={tab.rows} />
          </div>
        ))}
      </div>
    </div>
  )
}
