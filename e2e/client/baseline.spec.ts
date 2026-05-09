/**
 * Client (Casey) baseline. Casey is a client-role user linked to Cedar Creek
 * Dental. He should see only Cedar Creek and the public side of the relay.
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

for (const route of personaRoutes('client')) {
  test(`client baseline ${route.label}`, async ({ page }) => {
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

for (const route of personaHiddenRoutes('client')) {
  test(`client hidden ${route.label} should redirect`, async ({ page }) => {
    await page.goto(route.path)
    await page.waitForLoadState('networkidle').catch(() => {})
    const finalUrl = page.url()
    expect(finalUrl, `client should not reach hidden route ${route.label}`).not.toMatch(
      new RegExp(`${route.path.split('?')[0]}/?$`),
    )
  })
}
