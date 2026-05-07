import { db } from '@/db/client'
import type { UserRole } from '@/lib/types'

export async function listRoleDefaults(organizationId: string) {
  return db.roleDefault.findMany({
    where: { organizationId },
  })
}

export type RoleDefaultUpsert = {
  role: UserRole
  permissionKey: string
  allow: boolean
}

/**
 * Replaces the org's role defaults for the given role with the desired set.
 * Keys absent from `desired` are deleted (revert to system default).
 */
export async function replaceRoleDefaultsForRole(
  organizationId: string,
  role: UserRole,
  desired: { permissionKey: string; allow: boolean }[],
) {
  await db.$transaction([
    db.roleDefault.deleteMany({
      where: { organizationId, role },
    }),
    ...(desired.length > 0
      ? [
          db.roleDefault.createMany({
            data: desired.map((d) => ({
              organizationId,
              role,
              permissionKey: d.permissionKey,
              allow: d.allow,
            })),
          }),
        ]
      : []),
  ])
}
