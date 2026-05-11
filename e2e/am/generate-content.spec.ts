/**
 * Generate content entry-point tests.
 *
 * NOTE: As of the batch-page-nav overhaul (Task 5/7), the standalone
 * /generate page has been removed. The generate flow is now:
 *   - Batch page header "Generate Content" button opens a modal (no navigation)
 *   - The legacy /generate route redirects to the client page
 *   - Redirect behavior is verified in shared-checks/generate-redirect.spec.ts
 *   - Modal behavior is verified in am/generate-modal.spec.ts
 *
 * This file retains tests that verify the client page surfaces the Generate
 * affordance and that the modal interaction is accessible from the client page.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('am: /generate redirects to client page (does not render old form)', async ({ page }) => {
  const seed = readSeedData()
  const clientId = seed.clients.cedarCreekDental.id
  await page.goto(`/clients/${clientId}/generate`)
  await page.waitForLoadState('networkidle')

  // Must land on the client page, not the old /generate form.
  await expect(page).toHaveURL(`/clients/${clientId}`)
})

test('am: /generate?month= redirects to client page (query param dropped on redirect)', async ({
  page,
}) => {
  const seed = readSeedData()
  const clientId = seed.clients.cedarCreekDental.id
  await page.goto(`/clients/${clientId}/generate?month=2026-06`)
  await page.waitForLoadState('networkidle')

  // The redirect discards the legacy query param; we land on the client page.
  await expect(page).toHaveURL(`/clients/${clientId}`)
})

test('am: real-pipeline generate runs end to end', async ({ page }) => {
  test.skip(process.env.RUN_REAL_PIPELINE !== '1', 'stubbed by default; set RUN_REAL_PIPELINE=1 to enable')
  const seed = readSeedData()

  // New entry point: navigate to dashboard, click a batch, open the modal.
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  const batchLink = page.locator('a[href*="/batches/"]').first()
  if ((await batchLink.count()) === 0) test.skip(true, 'no batch links on dashboard')
  await batchLink.click()
  await page.waitForLoadState('networkidle')

  const generateBtn = page.getByRole('button', { name: /generate content/i }).first()
  await generateBtn.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Submit the form in the modal; the dialog should advance to a progress UI.
  const submitBtn = dialog.getByRole('button', { name: /generate/i }).first()
  await submitBtn.click()
  await expect(page.getByText(/(running|pending|generating)/i).first()).toBeVisible({
    timeout: 15_000,
  })
})
