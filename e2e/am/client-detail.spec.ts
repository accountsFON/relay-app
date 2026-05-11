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

