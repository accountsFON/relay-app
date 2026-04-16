export type Plan = 'smb' | 'agency' | 'enterprise'

export type UserRole = 'admin' | 'account_manager' | 'designer' | 'client'

export type ClientStatus = 'active' | 'paused' | 'archived'

export type RunStatus = 'queued' | 'running' | 'complete' | 'failed'

export type ApprovalStatus =
  | 'draft'
  | 'am_review'
  | 'design_review'
  | 'client_review'
  | 'approved'
  | 'scheduled'

export type ApprovalAction = 'approved' | 'rejected' | 'commented' | 'edited'

export type ApprovalStage = 'am' | 'design' | 'client'

/** Resolved org + user context attached to every authenticated request. */
export type OrgContext = {
  userId: string           // Clerk user ID
  orgId: string            // Clerk org ID
  role: UserRole
  plan: Plan
  organizationDbId: string // DB Organization.id (cuid)
  userDbId: string         // DB User.id (cuid)
}

/** Minimum client data needed to trigger a pipeline run. */
export type ClientRunInput = {
  clientId: string
  targetMonth: string      // YYYY-MM
  triggeredById: string    // DB User.id
}
