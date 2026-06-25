import type { TourStop } from '@/components/onboarding/tour-popover'
import type { UserRole } from '@/lib/types'

export type TourDef = {
  /** Versioned id; bumping the version re-fires for everyone. */
  id: string
  /** Role-specific display name (Tips launcher + Settings panel). */
  labelForRole: (role: UserRole) => string
  /** Roles that see this tour. Never includes 'client'. */
  roles: UserRole[]
  /** Route a manual replay navigates to before starting. */
  homePath: string
  /** Route gate for auto-fire. */
  matchPath: (pathname: string) => boolean
  /** 'auto' fires on match; 'manual' is settings-only. */
  trigger: 'auto' | 'manual'
  /** Role-tailored stops sharing one seen-key. */
  stopsForRole: (role: UserRole) => TourStop[]
}

/**
 * A "concept" stop has no real anchor; TourPopover centers it when the
 * selector matches nothing. This sentinel never matches an element.
 */
const CONCEPT_ANCHOR = '[data-tour-anchor="__concept__"]'

const OVERVIEW_AM: TourStop[] = [
  {
    id: 'overview-nav',
    anchorSelector: '[data-tour-anchor="my-relay"]',
    title: 'This is your home base',
    body: 'My Relay, Clients, and your Inbox live here. Everything starts from this nav.',
  },
  {
    id: 'overview-generate',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'A relay starts with content generation',
    body: 'Pick a client and a month, hit Generate, and Relay drafts the posts for you to review.',
  },
  {
    id: 'overview-pipeline',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'Every post moves through stages',
    body: 'Copy, then design, then your review, then the client review, then scheduling. The track on each relay shows where it is.',
  },
  {
    id: 'overview-review',
    anchorSelector: '[data-tour-anchor="inbox"]',
    title: 'You review and hand off',
    body: 'When a relay needs you, it shows up in your Inbox. You approve, request changes, or pass it to the client.',
  },
  {
    id: 'overview-schedule',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'Finish by scheduling',
    body: 'At the scheduling stage you export the CSV and jump to NectrCRM to load the posts.',
  },
]

const OVERVIEW_DESIGNER: TourStop[] = [
  {
    id: 'overview-nav',
    anchorSelector: '[data-tour-anchor="my-relay"]',
    title: 'This is your home base',
    body: 'My Relay shows the work waiting on you. Your queue lives here.',
  },
  {
    id: 'overview-design-stage',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'Your stage in the pipeline',
    body: 'Each relay moves through stages; you pick it up at the design stage after the copy is ready.',
  },
  {
    id: 'overview-handoff',
    anchorSelector: CONCEPT_ANCHOR,
    title: 'Upload and hand back',
    body: 'Add your designs to each post, then hand the relay back to the account manager for review.',
  },
]

const TOURS: TourDef[] = [
  {
    id: 'overview-v1',
    labelForRole: (role) =>
      role === 'designer'
        ? 'Designer Walkthrough'
        : role === 'admin'
          ? 'Admin Walkthrough'
          : 'Account Manager Walkthrough',
    roles: ['admin', 'account_manager', 'designer'],
    homePath: '/dashboard',
    matchPath: (p) => p === '/dashboard',
    trigger: 'auto',
    stopsForRole: (role) =>
      role === 'designer' ? OVERVIEW_DESIGNER : OVERVIEW_AM,
  },
]

export function getTourById(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id)
}

export function isValidTourId(id: string): boolean {
  return TOURS.some((t) => t.id === id)
}

export function listToursForRole(role: UserRole): TourDef[] {
  return TOURS.filter((t) => t.roles.includes(role))
}

/**
 * The first auto-fire tour that matches the current route + role and has
 * not been seen. Null when nothing should fire.
 */
export function selectAutoTour(
  pathname: string,
  role: UserRole,
  seenTours: string[],
): TourDef | null {
  return (
    TOURS.find(
      (t) =>
        t.trigger === 'auto' &&
        t.roles.includes(role) &&
        t.matchPath(pathname) &&
        !seenTours.includes(t.id),
    ) ?? null
  )
}
