/**
 * Every route in the app + which personas should reach it. The audit asserts
 * both directions:
 *  - reachable routes load 2xx, no console errors, pass axe
 *  - hidden routes either don't render the nav link OR redirect on direct URL
 */
import type { PersonaName } from '../fixtures/personas'

export type Reachability = 'allowed' | 'redirect' | 'hidden'

export interface RouteSpec {
  /** Path to navigate to. Tokens like {clientId} resolve from seed-data.json. */
  path: string
  /** Display label for findings + screenshot file names. */
  label: string
  /** Reachability per persona. Missing key implies allowed for all. */
  reachability?: Partial<Record<PersonaName, Reachability>>
  /** Skip visual capture, e.g. external nav surfaces or pages with timestamps. */
  skipVisual?: boolean
}

export const STATIC_ROUTES: RouteSpec[] = [
  { path: '/dashboard', label: 'dashboard' },
  { path: '/clients', label: 'clients-index' },
  {
    path: '/clients/new',
    label: 'clients-new',
    reachability: { designer: 'redirect', client: 'redirect' },
  },
  {
    path: '/clients/import',
    label: 'clients-import',
    reachability: { designer: 'redirect', client: 'redirect' },
  },
  { path: '/inbox', label: 'inbox' },
  { path: '/search', label: 'search-empty' },
  { path: '/search?q=Cedar', label: 'search-cedar' },
  {
    path: '/library',
    label: 'library',
    reachability: { client: 'redirect' },
  },
  {
    path: '/admin',
    label: 'admin-overview',
    reachability: { am: 'redirect', designer: 'redirect', client: 'redirect' },
  },
  {
    path: '/admin/users',
    label: 'admin-users',
    reachability: { am: 'redirect', designer: 'redirect', client: 'redirect' },
  },
  {
    path: '/admin/clients',
    label: 'admin-clients',
    reachability: { am: 'redirect', designer: 'redirect', client: 'redirect' },
  },
  {
    path: '/admin/roles',
    label: 'admin-roles',
    reachability: { am: 'redirect', designer: 'redirect', client: 'redirect' },
  },
  {
    path: '/platform',
    label: 'platform',
    reachability: {
      admin: 'redirect',
      am: 'redirect',
      designer: 'redirect',
      client: 'redirect',
    },
  },
  { path: '/settings/org', label: 'settings-org' },
  { path: '/no-access', label: 'no-access' },
]

/** Persona specific extra routes we expect to be reachable. */
export const personaRoutes = (persona: PersonaName): RouteSpec[] => {
  return STATIC_ROUTES.filter((r) => {
    const reach = r.reachability?.[persona] ?? 'allowed'
    return reach === 'allowed'
  })
}

export const personaHiddenRoutes = (persona: PersonaName): RouteSpec[] => {
  return STATIC_ROUTES.filter((r) => {
    const reach = r.reachability?.[persona]
    return reach === 'redirect' || reach === 'hidden'
  })
}
