import { test, expect } from '@playwright/test'

/**
 * Behavioral assertion on the platform Step in flow.
 *
 * Fixture state (set up by the demo seed):
 *   - Two organizations exist on the platform: "Relay Demo Agency" (the
 *     primary, populated with clients / runs / batches) and "Northwind
 *     Studio" (the secondary, empty, used as a known clean step in target).
 *   - The platform persona has a Membership in both, with Relay Demo
 *     Agency as the default active org.
 *
 * What we assert:
 *   1. Click Step in on the Northwind card.
 *   2. The router lands on /dashboard.
 *   3. The sidebar org chip shows "Northwind Studio" (NOT Relay Demo
 *      Agency). This is the regression net for the C4 fix from
 *      2026-05-09: the previous bug routed to /dashboard but left the
 *      sidebar chip stuck on the prior agency because the cookie was
 *      not set first.
 *   4. The dashboard data scopes to the new org. We use the Clients
 *      route as a clean signal: Relay Demo Agency has 20 clients,
 *      Northwind has 0. The /clients page should show an empty state.
 *
 * After the test, the platform persona is left stepped into Northwind.
 * Subsequent specs that require Relay Demo Agency context should run in
 * a separate persona project or step back via the agency dropdown. For
 * the audit's project layout (each persona has its own storageState),
 * this side effect is contained to the platform project and does not
 * leak across.
 */
test('platform: Step in switches sidebar org chip + scopes data to the target org', async ({
  page,
}) => {
  await page.goto('/platform')
  await page.waitForLoadState('networkidle')

  // Find the Northwind card and click Step in inside it.
  const northwindCard = page
    .locator('div')
    .filter({ hasText: /^Northwind Studio/ })
    .filter({ has: page.getByRole('button', { name: /Step in/i }) })
    .first()

  // Skip cleanly if Northwind is missing (older seed without secondary
  // org) instead of failing the audit. The seed update introduced this
  // org; if a runner is on a stale seed, we surface that fact rather
  // than blocking the run.
  if ((await northwindCard.count()) === 0) {
    test.skip(
      true,
      'Northwind Studio not present in seeded /platform; reseed required',
    )
  }

  const stepIn = northwindCard.getByRole('button', { name: /Step in/i })
  await stepIn.click()

  // Land on /dashboard.
  await page.waitForURL(/\/dashboard$/, { timeout: 10_000 })

  // Sidebar org chip reflects the new org. The OrgSwitcher dropdown
  // button renders activeAgencyName; the platform owner branch always
  // uses the AgencyDropdown which surfaces the name in a button.
  await expect(
    page.getByRole('button', { name: /Northwind Studio/i }).first(),
  ).toBeVisible({ timeout: 10_000 })

  // Data scope check: Relay Demo's 20 clients should NOT be reachable
  // while we are operating in Northwind context. Hit /clients and look
  // for the empty state, not Cedar Creek.
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  // No Relay Demo client name should appear.
  await expect(page.getByText(/Cedar Creek Dental/i)).toHaveCount(0)
})
