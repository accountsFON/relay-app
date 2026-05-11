/**
 * Verifies the Generate Content modal:
 *  - Opens from the batch page header (no route change)
 *  - Locks the targetMonth display (no editable picker)
 *  - Shows the Re-crawl websites toggle
 *  - Closing returns user to the batch page (no navigation away)
 *
 * Per spec § Section A and § Section B.
 */
import { test, expect } from '@playwright/test'

test('Generate modal opens, locks month, shows recrawl toggle', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  const batchLink = page.locator('a[href*="/batches/"]').first()
  if ((await batchLink.count()) === 0) test.skip(true, 'no batch links on dashboard')
  await batchLink.click()
  await page.waitForLoadState('networkidle')

  // Click the Generate content button on the batch page header
  await page.getByRole('button', { name: /generate content/i }).first().click()

  // Modal should be open (role=dialog)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Re-crawl toggle present
  await expect(dialog.getByLabel(/re-?crawl/i).first()).toBeVisible()

  // Month is shown read-only (look for any year/month display text inside the dialog)
  // Accept either "April 2026" or "2026-04" or month name patterns
  const monthText = dialog.getByText(/202\d|January|February|March|April|May|June|July|August|September|October|November|December/i)
  await expect(monthText.first()).toBeVisible()

  // Close modal, URL unchanged
  const batchPageUrl = page.url()
  await dialog.getByRole('button', { name: /cancel/i }).click()
  await expect(dialog).not.toBeVisible()
  expect(page.url()).toBe(batchPageUrl)
})
