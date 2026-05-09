import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

const CLIENT_COLUMNS = ['Awaiting Your Approval', 'In Production']

test('client dashboard: 2 column kanban renders', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  for (const col of CLIENT_COLUMNS) {
    await expect(
      page.getByRole('heading', { name: new RegExp(col, 'i') }),
    ).toBeVisible()
  }
})

test('client: only their linked client appears in /clients', async ({ page }) => {
  const seed = readSeedData()
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  // Cedar Creek visible.
  await expect(page.getByText(seed.clients.cedarCreekDental.name).first()).toBeVisible()
  // Apex Plumbing must NOT be visible (linked to Taylor only).
  await expect(page.getByText(seed.clients.apexPlumbing.name)).toHaveCount(0)
  // Sunrise Yoga must NOT be visible (linked to Dakota only).
  await expect(page.getByText(seed.clients.sunriseYoga.name)).toHaveCount(0)
})
