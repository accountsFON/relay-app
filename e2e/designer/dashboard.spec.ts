import { test, expect } from '@playwright/test'

const DESIGNER_COLUMNS = ['In Design', 'Awaiting QA', 'Revisions']

test('designer dashboard: 3 kanban columns render', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  for (const col of DESIGNER_COLUMNS) {
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${col}$`, 'i') }),
    ).toBeVisible()
  }
})

test('designer cannot see "Generate content" button', async ({ page }) => {
  // Designer has read access to client detail but no generate permission.
  // This test checks the role-gated UI doesn't expose the action.
  await page.goto('/clients')
  await page.waitForLoadState('networkidle')

  // Cedar Creek is one of Riley's assigned clients.
  const link = page.getByRole('link', { name: /Cedar Creek Dental/i }).first()
  await link.click()
  await page.waitForLoadState('networkidle')

  // The Generate affordance should NOT be visible.
  const generate = page.locator('a, button').filter({ hasText: /^generate( content)?$/i })
  await expect(generate).toHaveCount(0)
})
