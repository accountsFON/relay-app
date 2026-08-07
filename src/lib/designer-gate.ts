import { RelayStep } from '@prisma/client'
import type { UserRole } from '@/lib/types'

/**
 * Steps at which a designer must review the client profile + brand guide once
 * per relay before the workspace unlocks (the designer onboarding gate).
 */
export const DESIGNER_GATE_STEPS: RelayStep[] = [
  RelayStep.in_design,
  RelayStep.implementing_revisions,
]

/**
 * Whether the designer onboarding gate applies to this relay for this viewer,
 * BEFORE the (async, expensive) acknowledgement check. Archived relays
 * (`deletedAt` set) are always skipped. Callers should await the ack only when
 * this returns true, preserving the short-circuit.
 */
export function designerGateApplies(
  role: UserRole,
  deletedAt: Date | null,
  currentStep: RelayStep,
): boolean {
  return role === 'designer' && !deletedAt && DESIGNER_GATE_STEPS.includes(currentStep)
}
