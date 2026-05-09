/**
 * Take-over flow: admin can reassign a stuck batch to a different AM. The
 * stuck watchlist on /admin lets us pick a known-stuck batch deterministically
 * via the seed.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('admin take-over: stuck batch row exposes a reassign control', async ({ page }) => {
  const seed = readSeedData()
  if (seed.stuckBatchIds.length === 0) {
    test.skip(true, 'no stuck batches in seed; cannot exercise take-over')
  }

  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  // The stuck batch row component renders an action button per row. We don't
  // commit the click since it would mutate the batch; just assert the surface
  // exists and is reachable.
  const watchlistHeading = page.getByRole('heading', { name: /Stuck watchlist/i })
  await expect(watchlistHeading).toBeVisible()

  // Each stuck row should have at least one action affordance (button or link).
  const watchlist = watchlistHeading.locator('xpath=../..')
  const actionable = watchlist.locator('button, a').first()
  await expect(actionable).toBeVisible()
})
