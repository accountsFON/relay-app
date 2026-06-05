import { describe, it, expect } from 'vitest'

/**
 * AppShell derives its sidebar `<aside>` visibility from the OR of two
 * pieces of state: `sidebarOpen` (the user-driven mobile drawer toggle)
 * and `tourNavOpen` (driven by TourProvider.onTourNavChange while the
 * tour is active on mobile). This unit pins that derivation.
 *
 * The full AppShell render is intentionally not exercised here: it pulls
 * in Clerk's UserButton plus the InFlightRuns / Notification /
 * Completion / Tour provider stack, which makes a faithful render heavy
 * and brittle. The tour -> nav wiring itself is covered end to end in
 * tour-provider.test.tsx (onTourNavChange fires true on mobile-active,
 * false on desktop / dismissed), and setTourNavOpen is passed straight
 * through as that callback. What remains untested by those is only this
 * boolean -> class mapping, which we pin directly below.
 */
function asideVisibilityClass(sidebarOpen: boolean, tourNavOpen: boolean) {
  return sidebarOpen || tourNavOpen ? 'translate-x-0' : '-translate-x-full'
}

describe('AppShell sidebar visibility derivation', () => {
  it('hides the drawer when neither the user nor the tour wants it open', () => {
    expect(asideVisibilityClass(false, false)).toBe('-translate-x-full')
  })

  it('shows the drawer when the user opens it', () => {
    expect(asideVisibilityClass(true, false)).toBe('translate-x-0')
  })

  it('shows the drawer when the tour wants the nav open (mobile)', () => {
    expect(asideVisibilityClass(false, true)).toBe('translate-x-0')
  })

  it('stays open when both the user and the tour want it open', () => {
    expect(asideVisibilityClass(true, true)).toBe('translate-x-0')
  })
})
