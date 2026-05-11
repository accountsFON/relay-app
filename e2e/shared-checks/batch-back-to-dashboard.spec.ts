/**
 * Verifies that the Back button on the batch page navigates to /dashboard,
 * not to the parent client page. Per spec § Section A.
 */
import { test, expect } from '@playwright/test'
import { resolveSeedData } from '../fixtures/data'

test.use({ storageState: '.auth/admin.json' })

test('batch page back button → /dashboard', async ({ page }) => {
  const seed = await resolveSeedData()

  // Navigate to the dashboard and pick any batch link from the kanban.
  // The dashboard renders KanbanCards with href="/clients/[clientId]/batches/[batchId]"
  // which guarantees a valid clientId/batchId pair.
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const batchLink = page.locator('a[href*="/batches/"]').first()
  const batchLinkCount = await batchLink.count()
  if (batchLinkCount === 0) test.skip(true, 'no batch links found on dashboard')

  const href = await batchLink.getAttribute('href')
  await page.goto(href!)
  await page.waitForLoadState('networkidle')

  await page.getByRole('link', { name: /back/i }).first().click()

  await page.waitForURL(/\/dashboard/, { timeout: 5_000 })
  expect(page.url()).toMatch(/\/dashboard$/)
})
