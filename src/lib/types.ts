export type Plan = 'smb' | 'agency' | 'enterprise'

export type UserRole = 'admin' | 'account_manager' | 'designer' | 'client'

export type ClientStatus = 'active' | 'paused' | 'archived'

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed'

/**
 * Marker attached to an OrgContext that is an admin "viewing as" another
 * user. When present, every OTHER field on the context describes the
 * TARGET (role, userDbId, scope, perms, platformOwner forced false). This
 * marker carries what the Exit banner needs plus the real admin's id for
 * the impersonation audit log.
 */
export type ImpersonationActor = {
  realUserId: string       // the admin's DB User.id (audit + back-reference)
  realUserName: string     // the admin's name (banner context)
  targetUserName: string   // shown in the banner: "Acting as <targetUserName>"
}

/** Resolved org + user context attached to every authenticated request. */
export type OrgContext = {
  userId: string           // Clerk user ID
  orgId: string            // Clerk org ID
  role: UserRole
  plan: Plan
  organizationDbId: string // DB Organization.id (cuid)
  userDbId: string         // DB User.id (cuid)
  avatarUrl: string | null  // DB User.avatarUrl, for the account page + first-party header use
  platformOwner: boolean   // grants admin-equivalent access on every Org
  linkedClientId: string | null
  permissionOverrides: Record<string, boolean> | null
  roleDefaults: Partial<Record<UserRole, Partial<Record<string, boolean>>>>
  /**
   * Present only while an admin is viewing-as another user. Truthy means
   * "this context is impersonated". Optional so the many places that build
   * a normal OrgContext do not need to set it.
   */
  impersonation?: ImpersonationActor | null
}

/** Minimum client data needed to trigger a pipeline run. */
export type ClientRunInput = {
  clientId: string
  targetMonth: string      // YYYY-MM
  triggeredById: string    // DB User.id
}
