import type { UserRole } from '@/lib/types'

export const PERMISSION_KEYS = [
  'client.view',
  'client.edit',
  'client.create',
  'client.comment',
  'post.edit',
  'post.media.edit',
  'generation.trigger',
  'run.delete',
  'cost.viewAll',
  'admin.portal',
  'relay.pass',
  'relay.sendBack',
  'relay.takeOver',
  'relay.completeOnboarding',
  'relay.forceStep',
  'user.deactivate',
  'user.hardDelete',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'client.view': 'View clients',
  'client.edit': 'Edit client profile',
  'client.create': 'Create new clients',
  'client.comment': 'Post internal comments / pings',
  'post.edit': 'Edit captions / hashtags',
  'post.media.edit': 'Upload / replace post images',
  'generation.trigger': 'Trigger generation',
  'run.delete': 'Delete runs',
  'cost.viewAll': 'View cost dashboard',
  'admin.portal': 'Access admin portal',
  'relay.pass': 'Pass the baton (forward) on a relay',
  'relay.sendBack': 'Send a relay back to a previous step',
  'relay.takeOver': 'Take over a stuck relay from another holder',
  'relay.completeOnboarding': 'Mark a client onboarding gate complete',
  'relay.forceStep': 'Force a relay to any step (admin override)',
  'user.deactivate': 'Deactivate a user',
  'user.hardDelete': 'Permanently delete a user',
}

/**
 * One-line plain-English description of what granting each permission lets a
 * user do. Surfaced as hover hints in the role-defaults and per-user
 * permission editors so an admin knows the consequence of each toggle.
 *
 * Voice-owned. Obey the Wave 4K copy rules when editing:
 *  - No em or en dashes.
 *  - No compound hyphens in body copy.
 *  - Keep each value under 80 characters.
 */
export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'client.view': 'See client profiles, relays, posts, and review history',
  'client.edit': "Change a client's profile, brand, and settings",
  'client.create': 'Add brand new clients to the workspace',
  'client.comment': 'Post internal comments and pings on a client',
  'post.edit': 'Edit the caption and hashtags on a post',
  'post.media.edit': 'Upload or replace the image on a post',
  'generation.trigger': 'Start an AI content generation run for a client',
  'run.delete': 'Delete a generation run and its posts',
  'cost.viewAll': 'See the cost dashboard and spend across all clients',
  'admin.portal': 'Open the admin portal to manage users and roles',
  'relay.pass': 'Move a relay forward to the next step',
  'relay.sendBack': 'Return a relay to an earlier step for more work',
  'relay.takeOver': 'Take a stuck relay from whoever holds it now',
  'relay.completeOnboarding': "Mark a client's onboarding gate finished",
  'relay.forceStep': 'Jump a relay to any step, bypassing the flow',
  'user.deactivate': "Turn off a user's access without deleting them",
  'user.hardDelete': 'Permanently delete a user and all their records',
}

type PermissionMatrix = Record<UserRole, Record<PermissionKey, boolean>>

export const SYSTEM_DEFAULTS: PermissionMatrix = {
  admin: {
    'client.view': true,
    'client.edit': true,
    'client.create': true,
    'client.comment': true,
    'post.edit': true,
    'post.media.edit': true,
    'generation.trigger': true,
    'run.delete': true,
    'cost.viewAll': true,
    'admin.portal': true,
    'relay.pass': true,
    'relay.sendBack': true,
    'relay.takeOver': true,
    'relay.completeOnboarding': true,
    'relay.forceStep': true,
    'user.deactivate': true,
    'user.hardDelete': false,
  },
  account_manager: {
    'client.view': true,
    'client.edit': true,
    // Client creation is agency-admin-only by default. AMs keep client.edit
    // (edit existing clients, onboarding) but cannot create/import new clients;
    // an admin can still re-grant this per-user via the permissions editor.
    'client.create': false,
    'client.comment': true,
    'post.edit': true,
    'post.media.edit': true,
    'generation.trigger': true,
    'run.delete': true,
    'cost.viewAll': false,
    'admin.portal': false,
    'relay.pass': true,
    'relay.sendBack': true,
    'relay.takeOver': false,
    'relay.completeOnboarding': true,
    'relay.forceStep': false,
    'user.deactivate': false,
    'user.hardDelete': false,
  },
  designer: {
    'client.view': true,
    'client.edit': false,
    'client.create': false,
    'client.comment': true,
    'post.edit': false,
    'post.media.edit': true,
    'generation.trigger': false,
    'run.delete': false,
    'cost.viewAll': false,
    'admin.portal': false,
    'relay.pass': true,
    'relay.sendBack': false,
    'relay.takeOver': false,
    'relay.completeOnboarding': false,
    'relay.forceStep': false,
    'user.deactivate': false,
    'user.hardDelete': false,
  },
  client: {
    'client.view': true,
    'client.edit': false,
    'client.create': false,
    'client.comment': false,
    'post.edit': false,
    'post.media.edit': false,
    'generation.trigger': false,
    'run.delete': false,
    'cost.viewAll': false,
    'admin.portal': false,
    'relay.pass': true,
    'relay.sendBack': false,
    'relay.takeOver': false,
    'relay.completeOnboarding': false,
    'relay.forceStep': false,
    'user.deactivate': false,
    'user.hardDelete': false,
  },
}

export const READ_ONLY_OVERRIDE: Partial<Record<PermissionKey, boolean>> = {
  'client.edit': false,
  'client.create': false,
  'post.edit': false,
  'post.media.edit': false,
  'generation.trigger': false,
  'run.delete': false,
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
