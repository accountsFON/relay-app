/**
 * Permission leak tests: a client-role user must not be able to reach admin
 * surfaces, the platform page, or other clients' detail pages.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('client cannot directly access /admin', async ({ page }) => {
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')
  expect(page.url()).not.toMatch(/\/admin\/?$/)
})

test('client cannot directly access /platform', async ({ page }) => {
  await page.goto('/platform')
  await page.waitForLoadState('networkidle')
  expect(page.url()).not.toMatch(/\/platform\/?$/)
})

test('client cannot reach Apex Plumbing detail (not their linked client)', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.apexPlumbing.id}`)
  await page.waitForLoadState('networkidle')
  // Should redirect away (no-access or dashboard) OR render an empty/forbidden state.
  const url = page.url()
  const onForeignClient = url.includes(`/clients/${seed.clients.apexPlumbing.id}`)
  if (onForeignClient) {
    // If we're still on the page, the Apex name should NOT be displayed as the
    // current client (page should show no-access or similar).
    const apexHeading = page.getByRole('heading', { name: /Apex Plumbing/i })
    await expect(apexHeading).toHaveCount(0)
  }
})

test('client /library redirects to /dashboard', async ({ page }) => {
  await page.goto('/library')
  await page.waitForLoadState('networkidle')
  expect(page.url()).toMatch(/\/dashboard|\/no-access/)
})
