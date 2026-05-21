/**
 * Shared role-based holder-override predicate.
 *
 * AM + admin + platformOwner may act on a batch (passBaton / sendBack /
 * finishBatch) regardless of who currently holds it. Designer + client stay
 * gated to the current holder.
 *
 * Imported by:
 *   - src/server/actions/relay.ts (server-side gate on passBaton /
 *     sendBackBaton / finishBatch)
 *   - src/app/(app)/clients/[id]/batches/[batchId]/page.tsx (page-level
 *     canAct flag that decides whether the UI exposes the buttons at all)
 *
 * Keeping these two call sites in sync is the whole reason this lives in
 * /lib instead of being inlined in actions. If you change the predicate
 * here, both layers (UI + server) move together.
 */
import type { UserRole } from '@/lib/types'

export function canOverrideHolder(
  role: UserRole,
  platformOwner: boolean,
): boolean {
  if (platformOwner) return true
  return role === 'admin' || role === 'account_manager'
}
