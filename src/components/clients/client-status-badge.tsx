'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Badge, StatusDot } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { updateClientAction } from '@/app/(app)/clients/actions'

type ClientStatus = 'active' | 'paused' | 'archived'

const OPTIONS: { value: ClientStatus; label: string; description: string }[] = [
  { value: 'active', label: 'Active', description: 'Default state. Eligible for new runs.' },
  { value: 'paused', label: 'Paused', description: 'Temporarily on hold. No new runs auto-fire.' },
  { value: 'archived', label: 'Archived', description: 'Engagement ended. Hidden from default lists.' },
]

function statusVariant(status: ClientStatus) {
  if (status === 'active') return 'primary'
  if (status === 'archived') return 'secondary'
  return 'default'
}

function statusDot(status: ClientStatus) {
  if (status === 'active') return 'active'
  return 'inactive'
}

export function ClientStatusBadge({
  clientId,
  status,
  canEdit,
}: {
  clientId: string
  status: ClientStatus
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const handleSelect = (next: ClientStatus) => {
    if (next === status) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      await updateClientAction(clientId, { status: next })
      router.refresh()
      setOpen(false)
    })
  }

  if (!canEdit) {
    return (
      <Badge variant={statusVariant(status)}>
        <StatusDot status={statusDot(status)} />
        {status}
      </Badge>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          'group/status inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          status === 'active'
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : status === 'archived'
            ? 'bg-cream-80 text-ink-80 hover:bg-cream-warm'
            : 'bg-cream-warm text-foreground hover:bg-cream-80',
          pending && 'opacity-60 cursor-not-allowed'
        )}
        aria-label={`Status: ${status}. Click to change.`}
      >
        <StatusDot status={statusDot(status)} />
        <span>{status}</span>
        <ChevronDown className="size-3 opacity-60 transition-transform group-data-[popup-open]/status:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56 p-1">
        {OPTIONS.map((opt) => {
          const selected = opt.value === status
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={cn(
                'flex items-start gap-2.5 rounded-md px-2.5 py-2 cursor-pointer',
                selected && 'bg-cream-warm'
              )}
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center mt-0.5">
                {selected ? (
                  <Check className="size-3.5 text-foreground" />
                ) : (
                  <StatusDot status={opt.value === 'active' ? 'active' : 'inactive'} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground leading-tight">
                  {opt.label}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug normal-case tracking-normal">
                  {opt.description}
                </div>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
