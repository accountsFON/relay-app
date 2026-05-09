import { requireAdminPortal } from '@/server/middleware/permissions'
import { listRoleDefaults } from '@/server/repositories/roleDefaults'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { AdminTabs } from '../admin-tabs'
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
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-5xl">
      <PageHeader
        title="Role defaults"
        description="Org-wide defaults per role. Individual users can still be overridden on their detail page."
      />

      <div className="mt-6">
        <AdminTabs />
      </div>

      <div className="mt-10 space-y-6">
        {ROLES.map((role) => (
          <Card key={role}>
            <RoleDefaultsEditor role={role} initialOverrides={byRole[role]} />
          </Card>
        ))}
      </div>
    </div>
  )
}
