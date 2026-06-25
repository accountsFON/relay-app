import { describe, it, expect } from 'vitest'
import {
  selectAutoTour,
  getTourById,
  listToursForRole,
  isValidTourId,
} from '@/components/onboarding/tour-registry'

describe('tour-registry', () => {
  it('auto-fires the overview on /dashboard for an unseen account_manager', () => {
    const tour = selectAutoTour('/dashboard', 'account_manager', [])
    expect(tour?.id).toBe('overview-v1')
  })

  it('does not fire when the overview is already seen', () => {
    expect(selectAutoTour('/dashboard', 'account_manager', ['overview-v1'])).toBeNull()
  })

  it('does not fire off the dashboard route', () => {
    expect(selectAutoTour('/clients/abc', 'account_manager', [])).toBeNull()
  })

  it('never fires for the client role', () => {
    expect(selectAutoTour('/dashboard', 'client', [])).toBeNull()
  })

  it('fires for admin and designer too', () => {
    expect(selectAutoTour('/dashboard', 'admin', [])?.id).toBe('overview-v1')
    expect(selectAutoTour('/dashboard', 'designer', [])?.id).toBe('overview-v1')
  })

  it('gives the designer a different (shorter) stop set than the AM', () => {
    const tour = getTourById('overview-v1')!
    expect(tour.stopsForRole('designer').length).toBeLessThan(
      tour.stopsForRole('account_manager').length,
    )
  })

  it('lists role-appropriate tours and excludes client', () => {
    expect(listToursForRole('account_manager').map((t) => t.id)).toContain('overview-v1')
    expect(listToursForRole('client')).toHaveLength(0)
  })

  it('labels the overview per role', () => {
    const tour = getTourById('overview-v1')!
    expect(tour.labelForRole('account_manager')).toBe('Account Manager Walkthrough')
    expect(tour.labelForRole('designer')).toBe('Designer Walkthrough')
    expect(tour.labelForRole('admin')).toBe('Admin Walkthrough')
  })

  it('validates tour ids', () => {
    expect(isValidTourId('overview-v1')).toBe(true)
    expect(isValidTourId('batch-detail-v1')).toBe(true)
    expect(isValidTourId('nope')).toBe(false)
  })

  describe('batch-detail coachmark', () => {
    const ROUTE = '/clients/abc/batches/xyz'

    it('auto-fires on the relay detail route for internal roles', () => {
      expect(selectAutoTour(ROUTE, 'account_manager', [])?.id).toBe('batch-detail-v1')
      expect(selectAutoTour(ROUTE, 'admin', [])?.id).toBe('batch-detail-v1')
      expect(selectAutoTour(ROUTE, 'designer', [])?.id).toBe('batch-detail-v1')
    })

    it('does not fire on the detail page child routes (preview, review-sessions)', () => {
      expect(selectAutoTour(`${ROUTE}/preview`, 'account_manager', [])).toBeNull()
      expect(
        selectAutoTour(`${ROUTE}/review-sessions/s1`, 'account_manager', []),
      ).toBeNull()
    })

    it('does not fire when already seen', () => {
      expect(selectAutoTour(ROUTE, 'account_manager', ['batch-detail-v1'])).toBeNull()
    })

    it('never fires for the client role', () => {
      expect(selectAutoTour(ROUTE, 'client', [])).toBeNull()
    })

    it('is auto-fire only — not listed in the replay menu (no homePath)', () => {
      const ids = listToursForRole('account_manager').map((t) => t.id)
      expect(ids).toContain('overview-v1')
      expect(ids).not.toContain('batch-detail-v1')
    })
  })
})
