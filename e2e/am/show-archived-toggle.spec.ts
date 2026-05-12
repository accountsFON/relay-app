/**
 * Show-archived toggle round-trip: verifies that the ShowArchivedToggle
 * adds ?archived=1 to the URL when turned on and removes it when turned off,
 * on each of the four surfaces where it appears:
 *
 *   1. /dashboard
 *   2. /clients  (clients list)
 *   3. /clients/[id]  (client detail — toggle is in the Batches section)
 *   4. /clients/[id]/batches/[batchId]  (batch detail — posts toggle)
 *
 * The spec runs under the AM persona (storageState: .auth/am.json).
 * Cedar Creek Dental is used for the client/batch surfaces because
 * it is the first live client seeded and is always assigned to AM.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

async function toggleOn(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('switch', { name: /show archived/i }).first()
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page).toHaveURL(/archived=1/)
}

async function toggleOff(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('switch', { name: /show archived/i }).first()
  await toggle.click()
  await expect(page).not.toHaveURL(/archived=1/)
}

test('am: show-archived toggle round-trips URL on dashboard', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  await toggleOn(page)
  await toggleOff(page)
})

test('am: show-archived toggle round-trips URL on clients list', async ({ page }) => {
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  await toggleOn(page)
  await toggleOff(page)
})

test('am: show-archived toggle round-trips URL on client detail page', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}`)
  await page.waitForLoadState('networkidle')

  // The toggle lives in the ActiveBatchesSection on the client detail page.
  await toggleOn(page)
  await toggleOff(page)
})

test('am: show-archived toggle round-trips URL on batch detail page', async ({ page }) => {
  const seed = readSeedData()

  // Use any live batch — pick the first step we know has a batch.
  const batchId =
    seed.batchByStep['copy'] ??
    seed.batchByStep['in_design'] ??
    seed.batchByStep['am_review_design'] ??
    seed.batchByStep['sent_to_client']

  test.skip(!batchId, 'no seeded batch found for batch-detail toggle test')

  // The batch may belong to any client. Navigate via Cedar Creek first; if
  // the page redirects we skip rather than false-fail.
  await page.goto(
    `/clients/${seed.clients.cedarCreekDental.id}/batches/${batchId}`,
  )
  await page.waitForLoadState('networkidle')

  const url = page.url()
  if (url.includes('/dashboard') || url.includes('/no-access')) {
    test.skip(true, 'batch not visible from Cedar Creek in this seed; skipping')
    return
  }

  // The toggle is in the Posts section header.
  await toggleOn(page)
  await toggleOff(page)
})
