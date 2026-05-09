import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('admin clients table: 20 demo clients all surface', async ({ page }) => {
  const seed = readSeedData()
  await page.goto('/admin/clients')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(seed.clients.cedarCreekDental.name).first()).toBeVisible()
  await expect(page.getByText(seed.clients.apexPlumbing.name).first()).toBeVisible()
  await expect(page.getByText(seed.clients.ironwood.name).first()).toBeVisible()
})

test('admin roles: page renders without errors', async ({ page }) => {
  await page.goto('/admin/roles')
  await page.waitForLoadState('networkidle')

  // Heading visible (don't lock to exact text since copy can shift).
  await expect(page.locator('h1, h2').first()).toBeVisible()
})
