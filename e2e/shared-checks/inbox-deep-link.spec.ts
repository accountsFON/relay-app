/**
 * Inbox row deep-link behavior.
 *
 * As of the batch-page-nav overhaul (Task 7), the legacy /runs/ route is
 * deprecated and redirects to /batches/. Inbox deep links should point
 * directly to /batches/[batchId] surfaces. There should be no /runs/ hrefs
 * in the inbox since those would just redirect and create an extra round-trip.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/am.json' })

test('inbox row href targets the batch surface (not just /clients/[id])', async ({ page }) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')

  // Find any inbox row link to a /clients/.../batches/... surface.
  // /runs/ links are deprecated — inbox should emit /batches/ hrefs directly.
  const deepLink = page.locator('a[href*="/batches/"]')
  const count = await deepLink.count()
  expect(count, 'expected at least one inbox row to deep-link to a /batches/ surface').toBeGreaterThan(0)
})
