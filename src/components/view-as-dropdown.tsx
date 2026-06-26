'use client'

import { useState, useTransition } from 'react'
import { Eye } from 'lucide-react'
import { listImpersonationTargets, startViewAs } from '@/components/view-as-actions'

type Target = { userId: string; name: string; email: string; role: string }

const ROLE_LABEL: Record<string, string> = {
  account_manager: 'AM',
  designer: 'Designer',
  client: 'Client',
}

export function ViewAsDropdown() {
  const [open, setOpen] = useState(false)
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [query, setQuery] = useState('')
  const [, startTransition] = useTransition()

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && targets === null) {
      const list = await listImpersonationTargets()
      setTargets(list)
    }
  }

  const choose = (userId: string) => {
    startTransition(() => {
      void startViewAs(userId)
    })
  }

  const filtered = (targets ?? []).filter((t) => {
    const q = query.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q)
  })

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="View as user"
        className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
      >
        <Eye className="h-4 w-4 text-neutral-500" />
        <span className="hidden sm:inline">View as</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users…"
            className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <ul className="max-h-72 overflow-y-auto">
            {targets === null && <li className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
            {targets !== null && filtered.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">No users</li>
            )}
            {filtered.map((t) => (
              <li key={t.userId}>
                <button
                  type="button"
                  onClick={() => choose(t.userId)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-neutral-900">{t.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.email}</span>
                  </span>
                  <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                    {ROLE_LABEL[t.role] ?? t.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
