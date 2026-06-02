import Link from 'next/link'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { Badge } from '@/components/ui/badge'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { AdminTabs } from '../admin-tabs'
import { InviteMemberButton } from './invite-modal'
import type { UserRole } from '@/lib/types'

const ROLE_ORDER: UserRole[] = ['admin', 'account_manager', 'designer', 'client']
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admins',
  account_manager: 'Account Managers',
  designer: 'Designers',
  client: 'Clients',
}
const ROLE_BADGE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  account_manager: 'AM',
  designer: 'Designer',
  client: 'Client',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default async function AdminUsersPage() {
  const ctx = await requireAdminPortal()
  const memberships = await listMembershipsForOrg(ctx.organizationDbId)

  const byRole: Record<UserRole, typeof memberships> = {
    admin: [],
    account_manager: [],
    designer: [],
    client: [],
  }
  for (const m of memberships) byRole[m.role].push(m)

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <HeroBand
        title="Team"
        subtitle={`${memberships.length} ${memberships.length === 1 ? 'member' : 'members'} across this agency.`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Team' },
        ]}
      />
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <InviteMemberButton />
      </div>

      <div className="mt-6">
        <AdminTabs />
      </div>

      <div className="mt-10 space-y-8">
        {ROLE_ORDER.map((role) => {
          const list = byRole[role]
          if (list.length === 0) return null
          return (
            <PageSection key={role} title={ROLE_LABELS[role]}>
              <ul className="divide-y divide-border rounded-md border border-border bg-background">
                {list.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/admin/users/${m.user.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                        {initials(m.user.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {m.user.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {m.user.email}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="secondary">
                          {ROLE_BADGE_LABEL[m.role]}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground" aria-hidden>
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </PageSection>
          )
        })}
      </div>
    </div>
  )
}
