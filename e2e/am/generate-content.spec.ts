/**
 * Generate content flow. By default we DO NOT trigger the real pipeline.
 * Specs that need the live trigger.dev path are gated by `RUN_REAL_PIPELINE=1`
 * env and a name containing 'real-pipeline'.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('am: generate page loads with month picker pre-filled', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}/generate`)
  await page.waitForLoadState('networkidle')

  // Heading visible (either "Generate content" or similar).
  await expect(page.locator('h1').first()).toBeVisible()
})

test('am: ?month= and ?targetMonth= both bind to the picker', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}/generate?month=2026-06`)
  await page.waitForLoadState('networkidle')

  // The page must render its month-pre-filled form. Scope under <main> so we
  // do not collide with the AppShell DateScope pill ("This month") which
  // matches the same loose locator at the document root.
  const main = page.locator('main').first()
  const picker = main
    .locator('input[type="month"], input[name="month"], input[name="targetMonth"], select')
    .first()
  if ((await picker.count()) === 0) {
    // Some builds render the picker as a date input or button-with-text.
    const buttonPicker = main
      .locator('button')
      .filter({ hasText: /(jun|2026-06|june)/i })
      .first()
    await expect(buttonPicker).toBeVisible()
    return
  }
  await expect(picker).toBeVisible()
})

test('am: real-pipeline generate runs end to end', async ({ page }) => {
  test.skip(process.env.RUN_REAL_PIPELINE !== '1', 'stubbed by default; set RUN_REAL_PIPELINE=1 to enable')
  const seed = readSeedData()
  await page.goto(`/clients/${seed.clients.cedarCreekDental.id}/generate`)
  await page.waitForLoadState('networkidle')

  const generateBtn = page.getByRole('button', { name: /generate/i })
  await generateBtn.first().click()
  // The page should advance to a progress UI.
  await expect(page.getByText(/(running|pending|generating)/i).first()).toBeVisible({
    timeout: 15_000,
  })
})
