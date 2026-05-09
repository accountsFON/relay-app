import { test, expect } from '@playwright/test'

test('client: inbox loads (Casey has 1 mention seeded)', async ({ page }) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('h1').first()).toBeVisible()
})
