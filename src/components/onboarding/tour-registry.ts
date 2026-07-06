import type { TourStop } from '@/components/onboarding/tour-popover'
import type { UserRole } from '@/lib/types'

export type TourDef = {
  /** Versioned id; bumping the version re-fires for everyone. */
  id: string
  /** Role-specific display name (Tips launcher + Settings panel). */
  labelForRole: (role: UserRole) => string
  /** Roles that see this tour. Never includes 'client'. */
  roles: UserRole[]
  /**
   * Route a manual replay navigates to before starting. Tours WITHOUT a
   * homePath (page coachmarks on dynamic routes like a specific relay) are
   * auto-fire-on-first-visit only and are not listed in the Tips/Settings
   * replay menu, since there's no single page to send the user to.
   */
  homePath?: string
  /** Route gate for auto-fire. */
  matchPath: (pathname: string) => boolean
  /** 'auto' fires on match; 'manual' is settings-only. */
  trigger: 'auto' | 'manual'
  /**
   * Optional DOM gate: the tour only auto-fires when this selector resolves
   * to an element on the page. Used for step-specific coachmarks that share
   * a route with a broader tour (e.g. the scheduling tour fires only when
   * the scheduling-only "Go to NectrCRM" chip is present). The provider
   * checks this against the live DOM; the pure registry helpers ignore it.
   */
  requiresAnchor?: string
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

// Page coachmark: the relay (batch) detail page — the review-stages surface.
// Anchored to data-tour-anchor attributes on that page.
const BATCH_DETAIL_STOPS: TourStop[] = [
  {
    id: 'batch-track',
    anchorSelector: '[data-tour-anchor="relay-track"]',
    title: 'Where this relay is',
    body: 'This track shows every stage a relay moves through, from copy to scheduling. The highlighted step is where it sits right now.',
  },
  {
    id: 'batch-posts',
    anchorSelector: '[data-tour-anchor="relay-posts"]',
    title: 'Review the posts',
    body: 'Each generated post shows here. Open one to read the caption, check the image, and leave notes.',
  },
  {
    id: 'batch-actions',
    anchorSelector: '[data-tour-anchor="relay-actions"]',
    title: 'Act on it, then advance',
    body: 'Run the checklist, then approve, request changes, or move the relay to the next stage from here.',
  },
]

// Exact relay detail route only (not its /preview or /review-sessions children).
const BATCH_DETAIL_ROUTE = /^\/clients\/[^/]+\/batches\/[^/]+$/

// Step coachmark: shares the relay detail route but only fires when the relay
// is at a scheduling step, detected via the scheduling-only "Go to NectrCRM"
// chip (requiresAnchor below).
const SCHEDULING_STOPS: TourStop[] = [
  {
    id: 'schedule-export',
    anchorSelector: '[data-tour-anchor="schedule-export"]',
    title: 'Export the schedule',
    body: 'Download the month of posts as a CSV, ready to load into your scheduler.',
  },
  {
    id: 'schedule-nectrcrm',
    anchorSelector: '[data-tour-anchor="schedule-nectrcrm"]',
    title: 'Load them into NectrCRM',
    body: 'Jump to NectrCRM and upload the CSV to schedule the posts. That finishes the relay.',
  },
]

// Page coachmark: the client detail page — where a relay is generated.
const CLIENT_DETAIL_STOPS: TourStop[] = [
  {
    id: 'client-generate',
    anchorSelector: '[data-tour-anchor="generate-content"]',
    title: 'Start a relay here',
    body: 'Hit Generate content, pick a month, and Relay drafts that month of posts for this client.',
  },
  {
    id: 'client-pipeline',
    anchorSelector: '[data-tour-anchor="__concept__"]',
    title: 'Then it moves through the pipeline',
    body: 'Each post flows from copy to design to your review, then the client review, then scheduling.',
  },
]
// Exact client detail route only: /clients/:id, but not /clients (list),
// /clients/new, /clients/import, or deeper /clients/:id/* sub-pages.
const CLIENT_DETAIL_ROUTE = /^\/clients\/[^/]+$/

const INBOX_STOPS: TourStop[] = [
  {
    id: 'inbox-views',
    anchorSelector: '[data-tour-anchor="inbox-views"]',
    title: 'Your inbox',
    body: 'Anything that needs you shows up here. Switch between Timeline (newest first) and grouped By client.',
  },
  {
    id: 'inbox-how',
    anchorSelector: '[data-tour-anchor="__concept__"]',
    title: 'We ping you when it is your turn',
    body: 'A relay that reaches your step, a mention, or a finished client review lands here. Clear items as you handle them.',
  },
]

const CLIENTS_STOPS: TourStop[] = [
  {
    id: 'clients-list',
    anchorSelector: '[data-tour-anchor="clients-list"]',
    title: 'Your clients',
    body: 'Every brand you manage lives here. Open one to see their relays and start new content.',
  },
  {
    id: 'clients-add',
    anchorSelector: '[data-tour-anchor="__concept__"]',
    title: 'Adding a brand',
    body: 'Agency admins can add a brand with New client; Relay can then start drafting its content.',
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
    roles: ['admin', 'account_manager'],
    homePath: '/dashboard',
    matchPath: (p) => p === '/dashboard',
    trigger: 'auto',
    stopsForRole: (role) =>
      role === 'designer' ? OVERVIEW_DESIGNER : OVERVIEW_AM,
  },
  {
    id: 'batch-detail-v1',
    labelForRole: () => 'Relay page walkthrough',
    roles: ['admin', 'account_manager', 'designer'],
    // No homePath: dynamic route, auto-fire-on-first-visit only.
    matchPath: (p) => BATCH_DETAIL_ROUTE.test(p),
    trigger: 'auto',
    stopsForRole: () => BATCH_DETAIL_STOPS,
  },
  {
    id: 'scheduling-v1',
    labelForRole: () => 'Scheduling walkthrough',
    // Scheduling is AM-held; the NectrCRM chip only renders for admin/AM.
    roles: ['admin', 'account_manager'],
    // Same route as batch-detail-v1, but requiresAnchor gates it to the
    // scheduling step (the chip exists only then). The provider prefers this
    // over batch-detail-v1 when the anchor is present. Listed AFTER
    // batch-detail-v1 so the pure selectAutoTour default stays batch-detail.
    matchPath: (p) => BATCH_DETAIL_ROUTE.test(p),
    requiresAnchor: '[data-tour-anchor="schedule-nectrcrm"]',
    trigger: 'auto',
    stopsForRole: () => SCHEDULING_STOPS,
  },
  {
    id: 'client-detail-v1',
    labelForRole: () => 'Client page walkthrough',
    // Generation is admin/AM only (designers can't trigger it), so the
    // Generate anchor only exists for them.
    roles: ['admin', 'account_manager'],
    // No homePath: dynamic route, auto-fire-on-first-visit only. Exclude the
    // /clients/new + /clients/import sibling routes that match the regex.
    matchPath: (p) =>
      CLIENT_DETAIL_ROUTE.test(p) && p !== '/clients/new' && p !== '/clients/import',
    trigger: 'auto',
    stopsForRole: () => CLIENT_DETAIL_STOPS,
  },
  {
    id: 'inbox-v1',
    labelForRole: () => 'Inbox walkthrough',
    roles: ['admin', 'account_manager', 'designer'],
    homePath: '/inbox',
    matchPath: (p) => p === '/inbox',
    trigger: 'auto',
    stopsForRole: () => INBOX_STOPS,
  },
  {
    id: 'clients-v1',
    labelForRole: () => 'Clients walkthrough',
    roles: ['admin', 'account_manager', 'designer'],
    homePath: '/clients',
    matchPath: (p) => p === '/clients',
    trigger: 'auto',
    stopsForRole: () => CLIENTS_STOPS,
  },
]

export function getTourById(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id)
}

export function isValidTourId(id: string): boolean {
  return TOURS.some((t) => t.id === id)
}

/**
 * Tours to show in the Tips launcher + Settings replay menu for a role.
 * Only tours with a homePath are listed (a page coachmark on a dynamic
 * route has nowhere to replay-navigate to, so it auto-fires only).
 */
export function listToursForRole(role: UserRole): TourDef[] {
  return TOURS.filter((t) => t.roles.includes(role) && t.homePath != null)
}

/**
 * All auto-fire tours that match the current route + role and have not been
 * seen, in registry order. The provider refines this with the DOM-based
 * requiresAnchor check (which can't run in this pure function).
 */
export function eligibleAutoTours(
  pathname: string,
  role: UserRole,
  seenTours: string[],
): TourDef[] {
  return TOURS.filter(
    (t) =>
      t.trigger === 'auto' &&
      t.roles.includes(role) &&
      t.matchPath(pathname) &&
      !seenTours.includes(t.id),
  )
}

/**
 * The first auto-fire tour that matches the current route + role and has
 * not been seen (ignoring requiresAnchor). Null when nothing should fire.
 */
export function selectAutoTour(
  pathname: string,
  role: UserRole,
  seenTours: string[],
): TourDef | null {
  return eligibleAutoTours(pathname, role, seenTours)[0] ?? null
}
