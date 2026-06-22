/**
 * Relay UI labels: human strings + role colors for the relay surfaces.
 *
 * Pure data, safe to import from client components. State-machine helpers
 * (HOLDER_ROLE, validateTransition, legalSendBackTargets) live in
 * src/server/lib/relay-state-machine.ts and are imported in server
 * components only.
 */
import { RelayStep, RelayRole } from '@prisma/client'

export const STEP_LABEL: Record<RelayStep, string> = {
  // Active pipeline steps (canonical rework names)
  [RelayStep.onboarding_gate]: 'Onboarding',
  [RelayStep.copy]: 'Copy Review',
  [RelayStep.in_design]: 'Initial Design',
  [RelayStep.am_review_design]: 'Design Review',
  [RelayStep.design_revisions]: 'Design Revision',
  [RelayStep.am_qa_pre_client]: 'Pre-Client QA',
  [RelayStep.implementing_revisions]: 'Post Revision',
  [RelayStep.client_review]: 'Client Review',
  [RelayStep.scheduling]: 'Scheduling',
  [RelayStep.completed]: 'Completed',
  // Retired steps (keep existing labels for historical rows)
  [RelayStep.designs_completed]: 'Designs done',
  [RelayStep.sent_to_client]: 'With client',
  [RelayStep.client_decision]: 'Client decision',
  [RelayStep.ready_to_schedule]: 'Ready to schedule',
  [RelayStep.revisions_complete]: 'Revisions complete',
  [RelayStep.final_qa_schedule]: 'Final QA',
}

/**
 * Role colors aligned with the Relay v1 neutral brand system.
 * Hue-based distinctions (blue/purple/green) were retired in the brand
 * sweep, they broke the "hue-as-category-accent" rule by introducing
 * non-brand chromatic backgrounds on every relay surface. Roles are now
 * distinguished by lightness/inversion within the neutral scale:
 *   admin: muted gray (least emphasis, internal-only role)
 *   am: neutral-100 tint (warm, the working-default role)
 *   designer: light neutral-900 tint (cooler emphasis)
 *   client: inverse dark (strongest visual weight, signals "external")
 * Tailwind utility class triples to keep JSX readable.
 */
export const ROLE_COLOR: Record<RelayRole, { bg: string; text: string; ring: string }> = {
  [RelayRole.admin]: {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    ring: 'ring-muted-foreground/30',
  },
  [RelayRole.am]: {
    bg: 'bg-neutral-100',
    text: 'text-foreground',
    ring: 'ring-neutral-900/40',
  },
  [RelayRole.designer]: {
    bg: 'bg-neutral-900/10',
    text: 'text-foreground',
    ring: 'ring-neutral-900/40',
  },
  [RelayRole.client]: {
    bg: 'bg-foreground',
    text: 'text-background',
    ring: 'ring-foreground',
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
  // Active pipeline steps (mirrors HOLDER_ROLE in relay-state-machine.ts)
  [RelayStep.onboarding_gate]: RelayRole.am, // CHANGED: was admin (pipeline rework)
  [RelayStep.copy]: RelayRole.am,
  [RelayStep.in_design]: RelayRole.designer,
  [RelayStep.am_review_design]: RelayRole.am,
  [RelayStep.design_revisions]: RelayRole.designer,
  [RelayStep.am_qa_pre_client]: RelayRole.am,
  [RelayStep.implementing_revisions]: RelayRole.am,
  [RelayStep.client_review]: RelayRole.client, // NEW
  [RelayStep.scheduling]: RelayRole.am, // NEW
  [RelayStep.completed]: RelayRole.am,
  // Retired steps
  [RelayStep.designs_completed]: RelayRole.designer,
  [RelayStep.sent_to_client]: RelayRole.client,
  [RelayStep.client_decision]: RelayRole.client,
  [RelayStep.ready_to_schedule]: RelayRole.am,
  [RelayStep.revisions_complete]: RelayRole.am,
  [RelayStep.final_qa_schedule]: RelayRole.am,
}

/** Sub-state labels for step `copy`. Phase 1 only step that has sub-states. */
export const COPY_SUB_STATE_LABEL: Record<string, string> = {
  generating: 'Generating',
  drafted: 'Drafted',
  approved: 'Approved',
}

/**
 * Approximate days a batch has been on its current step using batch.createdAt.
 * Note: schema has no per-step entry timestamp, so this is days since batch
 * creation. Matches the existing approximation in the batch detail page.
 */
export function daysOnStep(batchCreatedAt: Date): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(batchCreatedAt).getTime()) / (24 * 60 * 60 * 1000)),
  )
}
