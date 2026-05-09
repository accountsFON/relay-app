/**
 * Inbox row deep-link behavior. Per the 2:04 PM 2026-05-09 fix, batch events
 * deep-link to /clients/[id]/batches/[batchId] and run events deep-link to
 * the run page; comment-only events still go to the client root.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/am.json' })

test('inbox row href targets the relevant surface (not just /clients/[id])', async ({ page }) => {
  await page.goto('/inbox')
  await page.waitForLoadState('networkidle')

  // Find any inbox row link to a /clients/.../batches/... or /runs/... surface.
  const deepLink = page.locator('a[href*="/batches/"], a[href*="/runs/"]')
  const count = await deepLink.count()
  expect(count, 'expected at least one inbox row to deep-link past /clients/[id]').toBeGreaterThan(0)
})
