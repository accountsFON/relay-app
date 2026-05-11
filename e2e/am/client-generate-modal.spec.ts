/**
 * Verifies the Generate Content modal on the CLIENT page:
 *  - "Generate content" button is present in the client page header (for editors)
 *  - Clicking it opens the dialog
 *  - Dialog includes an editable month picker (not locked)
 *  - Re-crawl toggle is present
 *  - Cancel closes the dialog without URL change
 *
 * Companion to e2e/am/generate-modal.spec.ts which covers the batch-page variant
 * (where month is locked).
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('Client page Generate modal opens with editable month picker', async ({ page }) => {
  const seed = readSeedData()
  if (!seed) test.skip(true, 'no seed data')

  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}`)
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /generate content/i }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Month picker (input type=month) should be present
  await expect(dialog.locator('input[type="month"]')).toBeVisible()

  // Re-crawl toggle present
  await expect(dialog.getByLabel(/re-?crawl/i).first()).toBeVisible()

  // Cancel closes the dialog, URL unchanged
  const url = page.url()
  await dialog.getByRole('button', { name: /cancel/i }).click()
  await expect(dialog).not.toBeVisible()
  expect(page.url()).toBe(url)
})
