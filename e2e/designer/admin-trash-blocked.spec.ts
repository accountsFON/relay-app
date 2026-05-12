/**
 * Route guard: designer role cannot reach /admin/trash.
 *
 * The admin layout checks can(ctx, 'admin.portal') and redirects to
 * /dashboard when the check fails. This spec confirms designer is redirected.
 */
import { test, expect } from '@playwright/test'

test('designer: /admin/trash redirects away (not admin role)', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  const finalUrl = page.url()
  expect(finalUrl).not.toContain('/admin/trash')
  expect(finalUrl).toMatch(/\/dashboard/)
})
