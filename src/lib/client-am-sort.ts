/**
 * AM-flavored sort for the /clients index. Surfaces clients in the order
 * an account manager naturally works through them:
 *
 *   1. Ready       – status='active' AND onboardingCompletedAt is set
 *   2. Onboarding  – status='active' AND onboardingCompletedAt is null
 *   3. Paused      – status='paused'
 *   4. Archived    – status='archived' (only present when showArchived=true)
 *
 * Within each rank, alphabetical by name (locale-aware).
 *
 * Pure: no DB / no Prisma. Lifted out of page.tsx so the rank logic is
 * unit-testable and reusable from the admin variant of /clients.
 *
 * Phase 2 item 12.
 */

export interface AmSortClient {
  id: string
  name: string
  status: 'active' | 'paused' | 'archived'
  onboardingCompletedAt: Date | null
}

export type AmSortRank = 'ready' | 'onboarding' | 'paused' | 'archived'

const RANK_ORDER: Record<AmSortRank, number> = {
  ready: 0,
  onboarding: 1,
  paused: 2,
  archived: 3,
}

export function amSortRank(client: AmSortClient): AmSortRank {
  if (client.status === 'archived') return 'archived'
  if (client.status === 'paused') return 'paused'
  if (client.onboardingCompletedAt === null) return 'onboarding'
  return 'ready'
}

export function sortClientsForAm<T extends AmSortClient>(clients: T[]): T[] {
  return [...clients].sort((a, b) => {
    const aRank = RANK_ORDER[amSortRank(a)]
    const bRank = RANK_ORDER[amSortRank(b)]
    if (aRank !== bRank) return aRank - bRank
    return a.name.localeCompare(b.name)
  })
}
