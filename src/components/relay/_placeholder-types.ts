/**
 * Local placeholder types for the surfaces split.
 *
 * Mirrors the spec at projects/relay-app/2026-05-09-relay-workflow-design.md
 * § Data Model. When Rails Phase 0 lands, delete this file and replace
 * imports with `import type { Batch, RelayStep, RelayRole, ... } from '@prisma/client'`.
 *
 * DO NOT add fields here that aren't in the spec. The point is type-shape
 * compatibility so the swap is mechanical.
 */

export type RelayStep =
  | 'onboarding_gate'
  | 'copy'
  | 'in_design'
  | 'designs_completed'
  | 'am_review_design'
  | 'design_revisions'
  | 'am_qa_pre_client'
  | 'sent_to_client'
  | 'client_decision'
  | 'ready_to_schedule'
  | 'implementing_revisions'
  | 'revisions_complete'
  | 'final_qa_schedule'

export type RelayRole = 'admin' | 'am' | 'designer' | 'client'

export type CopySubState = 'generating' | 'drafted' | 'approved' | null

export type RelayEventType =
  | 'pass_forward'
  | 'send_back'
  | 'revision_dispatched'
  | 'revision_completed'

export interface BatchSummary {
  id: string
  clientId: string
  label: string
  currentStep: RelayStep
  currentSubState: CopySubState
  currentRole: RelayRole
  holder: { id: string; name: string; avatarUrl?: string | null }
  daysOnCurrentStep: number
}

export interface ChecklistItem {
  id: string
  step: RelayStep
  label: string
  required: boolean
  checked: boolean
  checkedBy: string | null
  checkedAt: Date | null
}

export type RevisionItemType = 'copy' | 'design' | 'am_inline'
export type RevisionItemStatus = 'pending' | 'in_progress' | 'complete'

export interface RevisionItem {
  id: string
  type: RevisionItemType
  description: string
  status: RevisionItemStatus
  assignedTo: string
}

export const STEP_TO_ROLE: Record<RelayStep, RelayRole> = {
  onboarding_gate: 'admin',
  copy: 'am',
  in_design: 'designer',
  designs_completed: 'designer',
  am_review_design: 'am',
  design_revisions: 'designer',
  am_qa_pre_client: 'am',
  sent_to_client: 'client',
  client_decision: 'client',
  ready_to_schedule: 'am',
  implementing_revisions: 'am',
  revisions_complete: 'am',
  final_qa_schedule: 'am',
}

export const STEP_LABEL: Record<RelayStep, string> = {
  onboarding_gate: 'Onboarding',
  copy: 'Copy',
  in_design: 'In design',
  designs_completed: 'Designs done',
  am_review_design: 'AM review',
  design_revisions: 'Design revisions',
  am_qa_pre_client: 'Pre-client QA',
  sent_to_client: 'With client',
  client_decision: 'Client decision',
  ready_to_schedule: 'Ready to schedule',
  implementing_revisions: 'Implementing revisions',
  revisions_complete: 'Revisions complete',
  final_qa_schedule: 'Final QA',
}

/** Spec § UI Direction: role colors. */
export const ROLE_COLOR: Record<RelayRole, { bg: string; text: string; ring: string }> = {
  admin: { bg: 'bg-muted', text: 'text-muted-foreground', ring: 'ring-muted-foreground/30' },
  am: { bg: 'bg-blue-100', text: 'text-blue-900', ring: 'ring-blue-400' },
  designer: { bg: 'bg-purple-100', text: 'text-purple-900', ring: 'ring-purple-400' },
  client: { bg: 'bg-green-100', text: 'text-green-900', ring: 'ring-green-500' },
}
