/**
 * Visual baseline capture for the audit. Captures admin's view of every
 * reachable route at desktop / tablet / mobile widths. First run is the
 * baseline; subsequent runs do a 0.03 pixel diff against the baseline (set
 * in playwright.config.ts).
 *
 * Visual regressions are advisory in the audit's grading rubric, not
 * blocking, since cross-machine font rendering and animation easing introduce
 * noise.
 */
import { test, expect } from '@playwright/test'
import { STATIC_ROUTES } from '../shared/routes'
import { VIEWPORTS } from '../shared/screenshot'

test.describe.configure({ mode: 'serial' })

for (const route of STATIC_ROUTES) {
  if (route.skipVisual) continue
  // Only capture admin-allowed routes (admin sees everything).
  test(`visual ${route.label}`, async ({ page }) => {
    for (const key of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
      const v = VIEWPORTS[key]
      await page.setViewportSize({ width: v.width, height: v.height })
      await page.goto(route.path)
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(300)

      await expect(page).toHaveScreenshot(`${route.label}-${v.label}.png`, {
        fullPage: true,
        animations: 'disabled',
      })
    }
  })
}
