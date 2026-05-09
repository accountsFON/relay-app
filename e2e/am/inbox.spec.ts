import { test, expect } from '@playwright/test'

test('am: inbox renders mention rows for Morgan', async ({ page }) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('h1').first()).toBeVisible()

  // Morgan's seed plants 4 unread mentions; the page should not be the empty state.
  const empty = await page.getByText(/no\s+(mentions|inbox|notifications)/i).count()
  expect(empty, 'expected non-empty inbox for Morgan').toBe(0)
})
