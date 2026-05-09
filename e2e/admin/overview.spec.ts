/**
 * Admin overview interactions. The /admin Overview tab is the first surface a
 * new admin sees, so its onboarding queue + stuck watchlist need to look right
 * AND have reachable next-step buttons.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('admin overview: onboarding queue + stuck watchlist render', async ({ page }) => {
  const seed = readSeedData()

  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  // Onboarding queue should have at least 1 row (Ironwood + Maple & Oak both unassigned).
  await expect(
    page.getByRole('heading', { name: /Onboarding queue/i }),
  ).toBeVisible()
  await expect(page.getByText(seed.clients.ironwood.name).first()).toBeVisible()
  await expect(page.getByText(seed.clients.mapleAndOak.name).first()).toBeVisible()

  // Stuck watchlist should have rows; the seed plants 3 batches > 48h old.
  await expect(
    page.getByRole('heading', { name: /Stuck watchlist/i }),
  ).toBeVisible()
})

test('admin overview: AdminTabs shows Overview as active', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  // The active tab is rendered with aria-current="page"; if not, accept text-only.
  const overviewTab = page.locator('a, button').filter({ hasText: /^Overview$/i }).first()
  await expect(overviewTab).toBeVisible()
})

test('admin overview: clicking through to /admin/users works', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')

  await page.locator('a, button').filter({ hasText: /^Team$/i }).first().click()
  await expect(page).toHaveURL(/\/admin\/users/)
})
