/**
 * Canonical category color for each RelayStep.
 *
 * The brand system gives the relay surface 3 working hues plus ink:
 *   - blue   ... onboarding, admin, and client-held steps
 *   - yellow ... AM-held steps (the day to day operator)
 *   - coral  ... designer-held steps (where visuals live)
 *   - ink    ... completed (resolved, no longer in motion)
 *
 * Mockup 1 fixes 5 of these explicitly. The remaining 8 are extrapolated
 * by the role-owner heuristic above and are flagged in line so Caleb can
 * retune them on Monday 2026-05-25 without hunting for the assignments.
 *
 * The step indicator (ChecklistPanel + RelayTrack) uses this map to paint
 * the active node, and dashboard surfaces use it to tint baton-handoff
 * highlights so motion across the track reads as motion.
 */
import { RelayStep } from '@prisma/client'

export type StepCategoryColor = 'blue' | 'yellow' | 'coral' | 'ink'

export const STEP_COLOR: Record<RelayStep, StepCategoryColor> = {
  [RelayStep.onboarding_gate]: 'blue', // mockup explicit
  [RelayStep.copy]: 'yellow', // mockup explicit
  [RelayStep.in_design]: 'coral', // mockup explicit
  [RelayStep.designs_completed]: 'coral', // Caleb extrapolated (Designer = coral)
  [RelayStep.am_review_design]: 'yellow', // mockup explicit
  [RelayStep.design_revisions]: 'coral', // Caleb extrapolated (Designer = coral)
  [RelayStep.am_qa_pre_client]: 'yellow', // Caleb extrapolated (AM = yellow)
  [RelayStep.sent_to_client]: 'blue', // Caleb extrapolated (Client = blue)
  [RelayStep.client_decision]: 'blue', // Caleb extrapolated (Client = blue)
  [RelayStep.ready_to_schedule]: 'yellow', // Caleb extrapolated (AM = yellow)
  [RelayStep.implementing_revisions]: 'yellow', // Caleb extrapolated, could be coral
  [RelayStep.revisions_complete]: 'yellow', // Caleb extrapolated (AM = yellow)
  [RelayStep.final_qa_schedule]: 'yellow', // Caleb extrapolated (AM = yellow)
  [RelayStep.completed]: 'ink', // done relays read as resolved
}

/**
 * Resolve a category color for any step value. Falls back to blue on
 * unknown, null, or undefined so callers can render a sensible default
 * without branching.
 */
export function getStepColor(
  step: RelayStep | string | null | undefined,
): StepCategoryColor {
  if (step == null) return 'blue'
  if (typeof step === 'string' && step in STEP_COLOR) {
    return STEP_COLOR[step as RelayStep]
  }
  return 'blue'
}

/**
 * Tailwind class triples for each category color. Active circle gets the
 * 500 fill with white icon; recently passed highlights use the 300 tint
 * ring; tile backgrounds use the 100 wash. Done circles use ink. The
 * `leftBorder` slot is the 4px accent border for kanban cards.
 */
export const STEP_COLOR_CLASSES: Record<
  StepCategoryColor,
  {
    activeBg: string
    activeText: string
    ring: string
    wash: string
    text: string
    leftBorder: string
  }
> = {
  blue: {
    activeBg: 'bg-blue-500',
    activeText: 'text-white',
    ring: 'ring-blue-300',
    wash: 'bg-blue-100',
    text: 'text-blue-500',
    leftBorder: 'border-l-blue-500',
  },
  yellow: {
    activeBg: 'bg-yellow-500',
    activeText: 'text-neutral-900',
    ring: 'ring-yellow-300',
    wash: 'bg-yellow-100',
    text: 'text-yellow-500',
    leftBorder: 'border-l-yellow-500',
  },
  coral: {
    activeBg: 'bg-coral-500',
    activeText: 'text-white',
    ring: 'ring-coral-300',
    wash: 'bg-coral-100',
    text: 'text-coral-500',
    leftBorder: 'border-l-coral-500',
  },
  ink: {
    activeBg: 'bg-neutral-900',
    activeText: 'text-white',
    ring: 'ring-neutral-700',
    wash: 'bg-neutral-50',
    text: 'text-neutral-900',
    leftBorder: 'border-l-neutral-900',
  },
}
