/**
 * Relay UI labels — human strings + role colors for the relay surfaces.
 *
 * Pure data, safe to import from client components. State-machine helpers
 * (HOLDER_ROLE, validateTransition, legalSendBackTargets) live in
 * src/server/lib/relay-state-machine.ts and are imported in server
 * components only.
 */
import { RelayStep, RelayRole } from '@prisma/client'

export const STEP_LABEL: Record<RelayStep, string> = {
  [RelayStep.onboarding_gate]: 'Onboarding',
  [RelayStep.copy]: 'Copy',
  [RelayStep.in_design]: 'In design',
  [RelayStep.designs_completed]: 'Designs done',
  [RelayStep.am_review_design]: 'AM review',
  [RelayStep.design_revisions]: 'Design revisions',
  [RelayStep.am_qa_pre_client]: 'Pre-client QA',
  [RelayStep.sent_to_client]: 'With client',
  [RelayStep.client_decision]: 'Client decision',
  [RelayStep.ready_to_schedule]: 'Ready to schedule',
  [RelayStep.implementing_revisions]: 'Implementing revisions',
  [RelayStep.revisions_complete]: 'Revisions complete',
  [RelayStep.final_qa_schedule]: 'Final QA',
}

/**
 * Role colors per spec § UI Direction.
 * Admin gray, AM blue, Designer purple, Client green.
 * Tailwind utility class triples to keep JSX readable.
 */
export const ROLE_COLOR: Record<RelayRole, { bg: string; text: string; ring: string }> = {
  [RelayRole.admin]: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    ring: 'ring-muted-foreground/30',
  },
  [RelayRole.am]: {
    bg: 'bg-blue-100',
    text: 'text-blue-900',
    ring: 'ring-blue-400',
  },
  [RelayRole.designer]: {
    bg: 'bg-purple-100',
    text: 'text-purple-900',
    ring: 'ring-purple-400',
  },
  [RelayRole.client]: {
    bg: 'bg-green-100',
    text: 'text-green-900',
    ring: 'ring-green-500',
  },
}

/**
 * Step → holder role map for UI rendering (e.g., color-coding nodes on
 * the relay track). Mirrors HOLDER_ROLE in src/server/lib/relay-state-machine.ts
 * but lives here so client components don't reach into server/lib.
 *
 * Keep these two in sync. If they diverge, the state machine wins (it's
 * the authoritative source for permissions and transition validation).
 */
export const STEP_ROLE: Record<RelayStep, RelayRole> = {
  [RelayStep.onboarding_gate]: RelayRole.admin,
  [RelayStep.copy]: RelayRole.am,
  [RelayStep.in_design]: RelayRole.designer,
  [RelayStep.designs_completed]: RelayRole.designer,
  [RelayStep.am_review_design]: RelayRole.am,
  [RelayStep.design_revisions]: RelayRole.designer,
  [RelayStep.am_qa_pre_client]: RelayRole.am,
  [RelayStep.sent_to_client]: RelayRole.client,
  [RelayStep.client_decision]: RelayRole.client,
  [RelayStep.ready_to_schedule]: RelayRole.am,
  [RelayStep.implementing_revisions]: RelayRole.am,
  [RelayStep.revisions_complete]: RelayRole.am,
  [RelayStep.final_qa_schedule]: RelayRole.am,
}

/** Sub-state labels for step `copy`. Phase 1 only step that has sub-states. */
export const COPY_SUB_STATE_LABEL: Record<string, string> = {
  generating: 'Generating',
  drafted: 'Drafted',
  approved: 'Approved',
}
