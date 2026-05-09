import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('am: Cedar Creek client detail loads with profile + activity sections', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}`)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(seed.clients.cedarCreekDental.name).first()).toBeVisible()
  // Activity surface present.
  const activityHeader = page.locator('h2, h3').filter({ hasText: /activity/i }).first()
  await expect(activityHeader).toBeVisible()
})

test('am: client detail surfaces a Generate content affordance', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}`)
  await page.waitForLoadState('networkidle')

  // Either a button labeled "Generate", or a link to /generate.
  const generateAffordance = page
    .locator('a[href*="/generate"], button')
    .filter({ hasText: /generate/i })
    .first()
  await expect(generateAffordance).toBeVisible()
})
