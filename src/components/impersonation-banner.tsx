'use client'

import { useTransition } from 'react'
import { Eye } from 'lucide-react'
import { stopViewAs } from '@/components/view-as-actions'
import type { UserRole } from '@/lib/types'

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'Account Manager',
  designer: 'Designer',
  client: 'Client',
}

export function ImpersonationBanner({ targetName, role }: { targetName: string; role: UserRole }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950">
      <Eye className="h-4 w-4" />
      <span>
        Acting as {targetName} ({ROLE_LABEL[role]})
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => void stopViewAs())}
        className="rounded-full bg-amber-950/15 px-3 py-0.5 text-amber-950 hover:bg-amber-950/25 disabled:opacity-60"
      >
        {pending ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  )
}
