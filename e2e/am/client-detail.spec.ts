import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('am: Cedar Creek client detail loads with profile + client thread rail', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}`)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(seed.clients.cedarCreekDental.name).first()).toBeVisible()
  // Client thread now lives in the desktop right rail (Desktop Chrome viewport is lg+).
  await expect(page.getByTestId('client-thread-rail')).toBeVisible()
  await expect(
    page.getByTestId('client-thread-rail').getByRole('heading', { name: /client thread/i }),
  ).toBeVisible()
})

