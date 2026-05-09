/**
 * Platform owner (Pat) baseline. Pat sees /platform plus everything an admin
 * sees (he holds both flags).
 */
import { test, expect } from '@playwright/test'
import { personaRoutes } from '../shared/routes'
import {
  watchPage,
  assertClean,
  expectNoBlockingAxe,
  expectAccessibleButtons,
  expectAccessibleLinks,
  expectSingleH1,
  settle,
} from '../shared/checks'

// Platform sees every route, so personaRoutes('platform') == STATIC_ROUTES.
for (const route of personaRoutes('platform')) {
  test(`platform baseline ${route.label}`, async ({ page }) => {
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
