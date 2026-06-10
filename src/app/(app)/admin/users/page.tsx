import Link from 'next/link'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { listMembershipsForOrg } from '@/server/repositories/memberships'
import { Badge } from '@/components/ui/badge'
import { HeroBand } from '@/components/hero-band'
import { PageSection } from '@/components/ui/page-section'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { AdminTabs } from '../admin-tabs'
import { InviteMemberButton } from './invite-modal'
import { initials } from '@/lib/initials'
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

export default async function AdminUsersPage() {
  const ctx = await requireAdminPortal()
  const memberships = await listMembershipsForOrg(ctx.organizationDbId, {
    includeDeactivated: true,
  })

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
                      <Avatar className="size-10 shrink-0">
                        {m.user.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
                        <AvatarFallback>{initials(m.user.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          <span className="truncate">{m.user.name}</span>
                          {m.user.deactivatedAt && (
                            <span className="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-[11px] font-normal text-neutral-600">
                              Deactivated
                            </span>
                          )}
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
