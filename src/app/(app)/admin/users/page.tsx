import Link from 'next/link'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { listUsersByOrg } from '@/server/repositories/users'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  const users = await listUsersByOrg(ctx.organizationDbId)

  const byRole: Record<UserRole, typeof users> = {
    admin: [],
    account_manager: [],
    designer: [],
    client: [],
  }
  for (const u of users) byRole[u.role].push(u)

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {users.length} {users.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      <div className="space-y-8">
        {ROLE_ORDER.map((role) => {
          const list = byRole[role]
          if (list.length === 0) return null
          return (
            <section key={role}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {ROLE_LABELS[role]}
              </h2>
              <Card className="divide-y divide-border">
                {list.map((u) => {
                  const clientCount =
                    u.role === 'designer'
                      ? u._count.designedClients
                      : u._count.assignedClients
                  const showCount =
                    u.role === 'account_manager' || u.role === 'designer'
                  return (
                    <Link
                      key={u.id}
                      href={`/admin/users/${u.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {u.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {u.email}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
                        {showCount && (
                          <span>
                            {clientCount}{' '}
                            {clientCount === 1 ? 'client' : 'clients'}
                          </span>
                        )}
                        <Badge variant="secondary">
                          {ROLE_BADGE_LABEL[u.role]}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground" aria-hidden>
                        ›
                      </span>
                    </Link>
                  )
                })}
              </Card>
            </section>
          )
        })}
      </div>
    </div>
  )
}
