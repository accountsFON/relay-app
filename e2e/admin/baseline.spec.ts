/**
 * Admin (Alex) baseline coverage. Loops every reachable route and asserts:
 *   - the page loads with no 4xx/5xx
 *   - browser console has no errors (allowlist applied)
 *   - axe scan has zero serious + critical violations
 *   - every visible button has an accessible name
 *   - every visible link has an accessible name
 *   - exactly one (or two SR-friendly) <h1>
 */
import { test, expect } from '@playwright/test'
import { personaRoutes, personaHiddenRoutes } from '../shared/routes'
import {
  watchPage,
  assertClean,
  expectNoBlockingAxe,
  expectAccessibleButtons,
  expectAccessibleLinks,
  expectSingleH1,
  settle,
} from '../shared/checks'

for (const route of personaRoutes('admin')) {
  test(`admin baseline ${route.label}`, async ({ page }) => {
    const monitor = watchPage(page)
    try {
      const response = await page.goto(route.path)
      expect(response?.status() ?? 200, `${route.label}: navigation status`).toBeLessThan(400)
      await settle(page)

      await expectSingleH1(page, route.label)
      await expectAccessibleButtons(page, route.label)
      await expectAccessibleLinks(page, route.label)
      await expectNoBlockingAxe(page, route.label)

      assertClean(monitor, route.label)
    } finally {
      monitor.detach()
    }
  })
}

for (const route of personaHiddenRoutes('admin')) {
  test(`admin hidden ${route.label} should redirect`, async ({ page }) => {
    await page.goto(route.path)
    await page.waitForLoadState('networkidle').catch(() => {})
    const finalUrl = page.url()
    expect(finalUrl, `admin should not reach hidden route ${route.label}`).not.toContain(
      new URL(route.path, page.url()).pathname,
    )
  })
}
