import type { UserRole } from '@/lib/types'

export const PERMISSION_KEYS = [
  'client.view',
  'client.edit',
  'client.create',
  'post.view',
  'post.edit',
  'post.editStatus',
  'generation.trigger',
  'run.delete',
  'run.rerun',
  'designerNotes.edit',
  'csv.export',
  'cost.viewAll',
  'admin.portal',
  'team.manage',
  'team.editPermissions',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'client.view': 'View clients',
  'client.edit': 'Edit client profile',
  'client.create': 'Create new clients',
  'post.view': 'View posts',
  'post.edit': 'Edit captions / hashtags',
  'post.editStatus': 'Change post status',
  'generation.trigger': 'Trigger generation',
  'run.delete': 'Delete runs',
  'run.rerun': 'Re-run generation',
  'designerNotes.edit': 'Edit designer notes',
  'csv.export': 'Export to CSV',
  'cost.viewAll': 'View cost dashboard',
  'admin.portal': 'Access admin portal',
  'team.manage': 'Manage team (roles, assignments)',
  'team.editPermissions': 'Edit role and user permissions',
}

type PermissionMatrix = Record<UserRole, Record<PermissionKey, boolean>>

export const SYSTEM_DEFAULTS: PermissionMatrix = {
  admin: {
    'client.view': true,
    'client.edit': true,
    'client.create': true,
    'post.view': true,
    'post.edit': true,
    'post.editStatus': true,
    'generation.trigger': true,
    'run.delete': true,
    'run.rerun': true,
    'designerNotes.edit': true,
    'csv.export': true,
    'cost.viewAll': true,
    'admin.portal': true,
    'team.manage': true,
    'team.editPermissions': true,
  },
  account_manager: {
    'client.view': true,
    'client.edit': true,
    'client.create': true,
    'post.view': true,
    'post.edit': true,
    'post.editStatus': true,
    'generation.trigger': true,
    'run.delete': true,
    'run.rerun': true,
    'designerNotes.edit': true,
    'csv.export': true,
    'cost.viewAll': true,
    'admin.portal': false,
    'team.manage': false,
    'team.editPermissions': false,
  },
  designer: {
    'client.view': true,
    'client.edit': false,
    'client.create': false,
    'post.view': true,
    'post.edit': false,
    'post.editStatus': false,
    'generation.trigger': false,
    'run.delete': false,
    'run.rerun': false,
    'designerNotes.edit': false,
    'csv.export': true,
    'cost.viewAll': false,
    'admin.portal': false,
    'team.manage': false,
    'team.editPermissions': false,
  },
  client: {
    'client.view': true,
    'client.edit': false,
    'client.create': false,
    'post.view': true,
    'post.edit': false,
    'post.editStatus': false,
    'generation.trigger': false,
    'run.delete': false,
    'run.rerun': false,
    'designerNotes.edit': false,
    'csv.export': false,
    'cost.viewAll': false,
    'admin.portal': false,
    'team.manage': false,
    'team.editPermissions': false,
  },
}

export const READ_ONLY_OVERRIDE: Partial<Record<PermissionKey, boolean>> = {
  'client.edit': false,
  'client.create': false,
  'post.edit': false,
  'post.editStatus': false,
  'generation.trigger': false,
  'run.delete': false,
  'run.rerun': false,
  'designerNotes.edit': false,
}

export type RoleDefaultsByRole = Partial<
  Record<UserRole, Partial<Record<PermissionKey, boolean>>>
>

export type UserPermissionOverrides = Partial<Record<PermissionKey, boolean>>

export type PermissionResolutionContext = {
  role: UserRole
  permissionOverrides?: UserPermissionOverrides | null
  roleDefaults?: RoleDefaultsByRole | null
  platformOwner?: boolean
}

export function can(
  ctx: PermissionResolutionContext,
  action: PermissionKey,
): boolean {
  if (ctx.platformOwner === true) return true

  const userOverride = ctx.permissionOverrides?.[action]
  if (userOverride !== undefined) return userOverride

  const orgRoleDefault = ctx.roleDefaults?.[ctx.role]?.[action]
  if (orgRoleDefault !== undefined) return orgRoleDefault

  return SYSTEM_DEFAULTS[ctx.role][action]
}

export function describeOverrides(
  role: UserRole,
  overrides: UserPermissionOverrides | null | undefined,
  roleDefaults: RoleDefaultsByRole | null | undefined,
): { key: PermissionKey; current: boolean; isOverride: boolean }[] {
  return PERMISSION_KEYS.map((key) => {
    const current = can(
      { role, permissionOverrides: overrides, roleDefaults },
      key,
    )
    const isOverride = overrides?.[key] !== undefined
    return { key, current, isOverride }
  })
}
