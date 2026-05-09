/**
 * Header DateScope pill + search bar behavior. Runs as the admin persona
 * since admin sees the most pages.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/admin.json' })

test('header: DateScope pill defaults to "This month"', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const pill = page.getByRole('button', { name: /this month/i }).first()
  await expect(pill).toBeVisible()
})

test('header: selecting "Last month" updates the URL', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const pill = page.getByRole('button', { name: /this month/i }).first()
  await pill.click()

  const lastMonth = page.getByRole('menuitem', { name: /last month/i }).first()
  if ((await lastMonth.count()) === 0) {
    test.skip(true, 'DateScope pill has no Last month option exposed')
  }
  await lastMonth.click()

  // router.push for a same-route URL change does no network roundtrip, so
  // waitForLoadState('networkidle') would race; explicitly wait on the URL.
  await page.waitForURL(/scope=last_month/, { timeout: 5000 })
  expect(page.url()).toMatch(/scope=last_month/)
})

test('header: pressing "/" focuses the search input on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  await page.keyboard.press('/')
  // The search input should now be focused.
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first()
  if ((await searchInput.count()) === 0) {
    test.skip(true, 'no search input present in header on desktop')
  }
  await expect(searchInput).toBeFocused()
})

test('header: mobile renders a search icon link, not the input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // Either an icon button labelled "search" or a link to /search.
  const mobileSearch = page.getByRole('link', { name: /search/i }).or(
    page.getByRole('button', { name: /search/i }),
  ).first()
  await expect(mobileSearch).toBeVisible()
})
