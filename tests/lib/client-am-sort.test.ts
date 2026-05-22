import { describe, it, expect } from 'vitest'
import {
  amSortRank,
  sortClientsForAm,
  type AmSortClient,
} from '@/lib/client-am-sort'

function mk(
  id: string,
  name: string,
  status: AmSortClient['status'],
  onboardingCompletedAt: Date | null = new Date('2026-01-01'),
): AmSortClient {
  return { id, name, status, onboardingCompletedAt }
}

describe('amSortRank', () => {
  it('returns "ready" for active + onboarded clients', () => {
    expect(amSortRank(mk('1', 'A', 'active', new Date('2026-01-01')))).toBe(
      'ready',
    )
  })

  it('returns "onboarding" for active + onboardingCompletedAt null', () => {
    expect(amSortRank(mk('1', 'A', 'active', null))).toBe('onboarding')
  })

  it('returns "paused" for paused clients regardless of onboarding state', () => {
    expect(amSortRank(mk('1', 'A', 'paused', null))).toBe('paused')
    expect(amSortRank(mk('1', 'A', 'paused', new Date()))).toBe('paused')
  })

  it('returns "archived" for archived clients regardless of other state', () => {
    expect(amSortRank(mk('1', 'A', 'archived', null))).toBe('archived')
    expect(amSortRank(mk('1', 'A', 'archived', new Date()))).toBe('archived')
  })
})

describe('sortClientsForAm', () => {
  it('orders Ready first, then Onboarding, then Paused, then Archived', () => {
    const clients: AmSortClient[] = [
      mk('1', 'Charlie', 'archived'),
      mk('2', 'Alpha', 'paused'),
      mk('3', 'Bravo', 'active', null),
      mk('4', 'Delta', 'active', new Date('2026-01-01')),
    ]
    const sorted = sortClientsForAm(clients)
    expect(sorted.map((c) => c.id)).toEqual(['4', '3', '2', '1'])
  })

  it('sorts alphabetically within the same rank', () => {
    const clients: AmSortClient[] = [
      mk('z', 'Zeta', 'active'),
      mk('a', 'Alpha', 'active'),
      mk('m', 'Mike', 'active'),
    ]
    const sorted = sortClientsForAm(clients)
    expect(sorted.map((c) => c.name)).toEqual(['Alpha', 'Mike', 'Zeta'])
  })

  it('produces a new array rather than mutating the input', () => {
    const clients: AmSortClient[] = [
      mk('1', 'Zeta', 'active'),
      mk('2', 'Alpha', 'active'),
    ]
    const sorted = sortClientsForAm(clients)
    expect(sorted).not.toBe(clients)
    expect(clients[0].name).toBe('Zeta') // unchanged
  })

  it('handles an empty list', () => {
    expect(sortClientsForAm([])).toEqual([])
  })

  it('keeps locale-aware ordering for accented names', () => {
    const clients: AmSortClient[] = [
      mk('1', 'Zeta', 'active'),
      mk('2', 'Étoile', 'active'),
      mk('3', 'Bravo', 'active'),
    ]
    const sorted = sortClientsForAm(clients)
    // Bravo < Étoile < Zeta under locale-aware compare.
    expect(sorted.map((c) => c.name)).toEqual(['Bravo', 'Étoile', 'Zeta'])
  })
})
