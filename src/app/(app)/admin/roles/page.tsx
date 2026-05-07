import Link from 'next/link'
import { requireAdminPortal } from '@/server/middleware/permissions'
import { listRoleDefaults } from '@/server/repositories/roleDefaults'
import { Card } from '@/components/ui/card'
import { RoleDefaultsEditor } from './role-defaults-editor'
import type { UserRole } from '@/lib/types'
import type { PermissionKey } from '@/server/auth/permissions'

const ROLES: UserRole[] = ['admin', 'account_manager', 'designer', 'client']

export default async function AdminRolesPage() {
  const ctx = await requireAdminPortal()
  const all = await listRoleDefaults(ctx.organizationDbId)

  const byRole: Record<UserRole, Partial<Record<PermissionKey, boolean>>> = {
    admin: {},
    account_manager: {},
    designer: {},
    client: {},
  }
  for (const r of all) {
    byRole[r.role][r.permissionKey as PermissionKey] = r.allow
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to team
        </Link>
      </div>

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Role defaults
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Org-wide defaults per role. Individual users can still be overridden
          on their detail page.
        </p>
      </div>

      <div className="space-y-6">
        {ROLES.map((role) => (
          <Card key={role}>
            <RoleDefaultsEditor
              role={role}
              initialOverrides={byRole[role]}
            />
          </Card>
        ))}
      </div>
    </div>
  )
}
