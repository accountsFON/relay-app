export type Plan = 'smb' | 'agency' | 'enterprise'

export type UserRole = 'admin' | 'account_manager' | 'designer' | 'client'

export type ClientStatus = 'active' | 'paused' | 'archived'

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed'

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
}

/** Minimum client data needed to trigger a pipeline run. */
export type ClientRunInput = {
  clientId: string
  targetMonth: string      // YYYY-MM
  triggeredById: string    // DB User.id
}
