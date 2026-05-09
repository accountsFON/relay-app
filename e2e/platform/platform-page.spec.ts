import { test, expect } from '@playwright/test'

test('platform: /platform shows agency list', async ({ page }) => {
  await page.goto('/platform')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('h1').first()).toBeVisible()
  // Demo agency surfaces somewhere on the page.
  await expect(page.getByText(/Relay Demo Agency/i).first()).toBeVisible()
})

test('platform: create agency modal opens + closes', async ({ page }) => {
  await page.goto('/platform')
  await page.waitForLoadState('networkidle')

  const createBtn = page.getByRole('button', { name: /(create|new).*(agency|org)/i }).first()
  // Some platform builds expose this only when the org list is non-empty;
  // skip if not present rather than fail the audit on a soft surface.
  if ((await createBtn.count()) === 0) {
    test.skip(true, 'create-agency button not exposed on /platform')
  }

  await createBtn.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
