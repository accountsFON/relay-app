/**
 * AM kanban: Morgan should see all 6 AM kanban columns and have batches
 * across them per the seed.
 */
import { test, expect } from '@playwright/test'

const AM_COLUMNS = [
  'Copy',
  'Design',
  'Pre-Client QA',
  'With Client',
  'Revisions',
  'Schedule',
]

test('am dashboard: 6 kanban columns render', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  for (const col of AM_COLUMNS) {
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${col}$`, 'i') }),
    ).toBeVisible()
  }
})

test('am dashboard: DateScope pill is mounted in header', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // The pill is rendered by AppShell. It's a button or select labelled with
  // the current scope. "This month" is the default per the project notes.
  const pill = page.getByRole('button', { name: /(this month|month|scope|all time)/i })
  await expect(pill.first()).toBeVisible()
})

test('am dashboard: kanban card links to /clients/[id]/batches/[batchId]', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // Find any kanban card link.
  const cardLinks = page.locator('a[href*="/clients/"][href*="/batches/"]')
  const count = await cardLinks.count()
  expect(count, 'expected at least one kanban card with a batch link').toBeGreaterThan(0)
})
