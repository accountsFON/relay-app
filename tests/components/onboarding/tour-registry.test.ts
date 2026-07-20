import { describe, it, expect } from 'vitest'
import {
  selectAutoTour,
  eligibleAutoTours,
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

  it('does not fire on a route with no tour (e.g. settings)', () => {
    expect(selectAutoTour('/settings/org', 'account_manager', [])).toBeNull()
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

    it('auto-fires on the relay detail route for admin and account_manager', () => {
      expect(selectAutoTour(ROUTE, 'account_manager', [])?.id).toBe('batch-detail-v1')
      expect(selectAutoTour(ROUTE, 'admin', [])?.id).toBe('batch-detail-v1')
      // designer is no longer in batch-detail-v1 — they get the manual designer tour
      expect(selectAutoTour(ROUTE, 'designer', [])).toBeNull()
    })

    it('does not fire on the detail page child routes (preview, review-sessions)', () => {
      expect(selectAutoTour(`${ROUTE}/preview`, 'account_manager', [])).toBeNull()
      expect(
        selectAutoTour(`${ROUTE}/review-sessions/s1`, 'account_manager', []),
      ).toBeNull()
    })

    it('does not fire when all relay-route tours are seen', () => {
      // The relay route also hosts scheduling-v1 (for AM), so both must be
      // seen for the pure selector to go quiet.
      expect(
        selectAutoTour(ROUTE, 'account_manager', ['batch-detail-v1', 'scheduling-v1']),
      ).toBeNull()
      // For a designer (no scheduling tour), batch-detail alone silences it.
      expect(selectAutoTour(ROUTE, 'designer', ['batch-detail-v1'])).toBeNull()
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

  describe('client-detail coachmark (generation)', () => {
    it('auto-fires on /clients/:id for admin + account_manager', () => {
      expect(selectAutoTour('/clients/abc', 'account_manager', [])?.id).toBe('client-detail-v1')
      expect(selectAutoTour('/clients/abc', 'admin', [])?.id).toBe('client-detail-v1')
    })

    it('does not fire for designer or client (no generate access)', () => {
      expect(selectAutoTour('/clients/abc', 'designer', [])).toBeNull()
      expect(selectAutoTour('/clients/abc', 'client', [])).toBeNull()
    })

    it('does not fire on the /clients/new or /clients/import sibling routes', () => {
      expect(selectAutoTour('/clients/new', 'account_manager', [])).toBeNull()
      expect(selectAutoTour('/clients/import', 'account_manager', [])).toBeNull()
    })

    it('does not collide with the clients list or a relay sub-page', () => {
      // /clients (list) -> clients-v1, not client-detail-v1
      expect(selectAutoTour('/clients', 'account_manager', [])?.id).toBe('clients-v1')
      // /clients/:id/batches/:id -> batch-detail-v1, not client-detail-v1
      expect(selectAutoTour('/clients/abc/batches/xyz', 'account_manager', [])?.id).toBe(
        'batch-detail-v1',
      )
    })

    it('is auto-fire only — not in the replay menu', () => {
      expect(listToursForRole('account_manager').map((t) => t.id)).not.toContain(
        'client-detail-v1',
      )
    })
  })

  describe('inbox + clients coachmarks (static routes, replayable)', () => {
    it('auto-fires the inbox tour on /inbox for internal roles', () => {
      expect(selectAutoTour('/inbox', 'account_manager', [])?.id).toBe('inbox-v1')
      expect(selectAutoTour('/inbox', 'designer', [])?.id).toBe('inbox-v1')
    })

    it('auto-fires the clients tour on /clients for internal roles', () => {
      expect(selectAutoTour('/clients', 'designer', [])?.id).toBe('clients-v1')
    })

    it('never fires either for the client role', () => {
      expect(selectAutoTour('/inbox', 'client', [])).toBeNull()
      expect(selectAutoTour('/clients', 'client', [])).toBeNull()
    })

    it('lists inbox + clients (homePath set) in the replay menu', () => {
      const ids = listToursForRole('account_manager').map((t) => t.id)
      expect(ids).toEqual(
        expect.arrayContaining(['overview-v1', 'inbox-v1', 'clients-v1']),
      )
    })
  })

  it('validates the new coachmark ids', () => {
    for (const id of ['client-detail-v1', 'inbox-v1', 'clients-v1']) {
      expect(isValidTourId(id)).toBe(true)
    }
  })

  describe('designer-batch-detail-v1 tour', () => {
    const BATCH_PATH = '/clients/abc/batches/xyz'

    it('defines designer-batch-detail-v1 as a manual, designer-only 7-stop tour matching the real page order', () => {
      const t = getTourById('designer-batch-detail-v1')
      expect(t).toBeDefined()
      expect(t!.roles).toEqual(['designer'])
      expect(t!.trigger).toBe('manual')
      const stops = t!.stopsForRole('designer')
      // Natural work order: orient on the track, understand the post (copy ->
      // hook -> notes), upload the designs, run the checklist, hand it back.
      expect(stops.map((s) => s.anchorSelector)).toEqual([
        '[data-tour-anchor="relay-track"]',
        '[data-tour-anchor="relay-posts"]',
        '[data-tour-anchor="relay-graphic-hook"]',
        '[data-tour-anchor="relay-designer-notes"]',
        '[data-tour-anchor="relay-upload-images"]',
        '[data-tour-anchor="relay-actions"]',
        '[data-tour-anchor="relay-actions"]',
      ])
      expect(isValidTourId('designer-batch-detail-v1')).toBe(true)
    })

    it('spotlights the Upload images section and explains both bulk and single upload', () => {
      const stops = getTourById('designer-batch-detail-v1')!.stopsForRole('designer')
      const uploadStop = stops.find(
        (s) => s.anchorSelector === '[data-tour-anchor="relay-upload-images"]',
      )
      expect(uploadStop).toBeDefined()
      const body = uploadStop!.body.toLowerCase()
      expect(body).toContain('bulk')
      // "one at a time" is how the copy describes the per-post single upload.
      expect(body).toContain('one at a time')
    })

    it('removes designer from the shared batch-detail-v1 tour', () => {
      expect(getTourById('batch-detail-v1')!.roles).toEqual(['admin', 'account_manager'])
    })

    it('does not auto-fire the manual designer tour, nor the shared tour, for a designer', () => {
      const ids = eligibleAutoTours(BATCH_PATH, 'designer', []).map((t) => t.id)
      expect(ids).not.toContain('designer-batch-detail-v1')
      expect(ids).not.toContain('batch-detail-v1')
    })

    it('still auto-fires the shared tour for an account manager', () => {
      const ids = eligibleAutoTours(BATCH_PATH, 'account_manager', []).map((t) => t.id)
      expect(ids).toContain('batch-detail-v1')
    })
  })

  describe('scheduling coachmark (step-gated via requiresAnchor)', () => {
    const ROUTE = '/clients/abc/batches/xyz'

    it('is eligible alongside the relay-page tour on the relay route (admin/AM)', () => {
      const ids = eligibleAutoTours(ROUTE, 'account_manager', []).map((t) => t.id)
      expect(ids).toContain('batch-detail-v1')
      expect(ids).toContain('scheduling-v1')
    })

    it('declares a requiresAnchor DOM gate (the NectrCRM chip)', () => {
      expect(getTourById('scheduling-v1')!.requiresAnchor).toBe(
        '[data-tour-anchor="schedule-nectrcrm"]',
      )
    })

    it('is admin/AM only (not designer or client)', () => {
      expect(eligibleAutoTours(ROUTE, 'designer', []).map((t) => t.id)).not.toContain(
        'scheduling-v1',
      )
      expect(eligibleAutoTours(ROUTE, 'client', [])).toHaveLength(0)
    })

    it('does not change the pure default — selectAutoTour is still batch-detail-v1', () => {
      expect(selectAutoTour(ROUTE, 'account_manager', [])?.id).toBe('batch-detail-v1')
    })

    it('is auto-fire only — not in the replay menu', () => {
      expect(listToursForRole('account_manager').map((t) => t.id)).not.toContain(
        'scheduling-v1',
      )
    })
  })
})
