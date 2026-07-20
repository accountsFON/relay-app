/**
 * Onboarding tour persistence services.
 *
 * Three small operations on the User row that drive the Phase 4 item 25
 * launch pad + 3 stop guided tour:
 *
 *   1. markLaunchPadDismissed: user tapped "Skip, I'll explore" or top
 *      right X on /welcome. Sets User.launchPadDismissedAt = now().
 *      Does NOT touch the tour column on its own so a user who skips the
 *      launch pad can still get the auto fire tour on /dashboard.
 *   2. markTourSeen: user finished step 3, hit ESC, or hit Skip on any
 *      step. Sets User.onboardingTourSeenAt = now(). Also stamps
 *      launchPadDismissedAt so the layout redirect predicate (both null)
 *      can never re fire after a completed tour.
 *   3. resetTour: clears both columns AND the seenTours coachmark list.
 *      Wired to the "Restart guided tour" control in /settings/org. Next /dashboard hit redirects
 *      to /welcome and the tour can fire again.
 *
 * Auth note: all three are invoked from server actions or API routes
 * that already require an authenticated app user via getOrgContext.
 * The service layer trusts that the caller has resolved a real User
 * row and accepts the dbUserId directly. Cross org tenancy is not a
 * concern here because the operation only touches that user's row.
 *
 * Idempotent: re-running markLaunchPadDismissed or markTourSeen after
 * the column is set just bumps the timestamp, which is the desired
 * "the user dismissed again" behaviour.
 *
 * Phase 4 item 25. See
 * projects/relay-app/2026-06-01-phase-4-design-brief.md § Item 25.
 */
import { db } from '@/db/client'

export interface MarkLaunchPadDismissedResult {
  userId: string
  launchPadDismissedAt: Date
}

export interface MarkTourSeenResult {
  userId: string
  onboardingTourSeenAt: Date
  launchPadDismissedAt: Date
}

export interface ResetTourResult {
  userId: string
  onboardingTourSeenAt: null
  launchPadDismissedAt: null
  seenTours: []
}

/**
 * Mark /welcome as dismissed for this user. Fires when the user taps
 * "Skip, I'll explore" or the top right X on the launch pad.
 */
export async function markLaunchPadDismissed(
  userDbId: string,
): Promise<MarkLaunchPadDismissedResult> {
  const now = new Date()
  await db.user.update({
    where: { id: userDbId },
    data: { launchPadDismissedAt: now },
  })
  return { userId: userDbId, launchPadDismissedAt: now }
}

/**
 * Mark the guided tour as seen. Fires when the user finishes step 3,
 * hits ESC, or hits the Skip button on any stop. Also stamps
 * launchPadDismissedAt so the (app) layout redirect predicate
 * (both columns null) can never re fire after a completed tour.
 */
export async function markTourSeen(userDbId: string): Promise<MarkTourSeenResult> {
  const now = new Date()
  await db.user.update({
    where: { id: userDbId },
    data: {
      onboardingTourSeenAt: now,
      launchPadDismissedAt: now,
    },
  })
  return {
    userId: userDbId,
    onboardingTourSeenAt: now,
    launchPadDismissedAt: now,
  }
}

/**
 * Append a versioned tour id to User.seenTours (deduped). Read-modify-write
 * so a replay-then-finish never pushes a duplicate. Independent of the
 * legacy markTourSeen/markLaunchPadDismissed columns.
 */
export async function markSeenTour(
  userDbId: string,
  tourId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userDbId },
    select: { seenTours: true },
  })
  const current = user?.seenTours ?? []
  if (current.includes(tourId)) return
  await db.user.update({
    where: { id: userDbId },
    data: { seenTours: [...current, tourId] },
  })
}

/**
 * Restart every guided tour for a user. Clears the two /welcome columns so
 * the user re lands on /welcome and gets the overview tour again, AND empties
 * the `seenTours` list so the page coachmark tours (batch-detail,
 * designer-batch-detail, client-detail, inbox, scheduling, clients) auto fire
 * again on their next visit. Those coachmarks gate on `seenTours` via
 * startIfUnseen, so clearing only the two columns left them suppressed. Wired
 * to the Settings "Restart guided tour" control.
 */
export async function resetTour(userDbId: string): Promise<ResetTourResult> {
  await db.user.update({
    where: { id: userDbId },
    data: {
      onboardingTourSeenAt: null,
      launchPadDismissedAt: null,
      seenTours: [],
    },
  })
  return {
    userId: userDbId,
    onboardingTourSeenAt: null,
    launchPadDismissedAt: null,
    seenTours: [],
  }
}
