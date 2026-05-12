/**
 * Route guard: AM role cannot reach /admin/trash.
 *
 * The admin layout checks can(ctx, 'admin.portal') and redirects to
 * /dashboard when the check fails. This spec confirms AM is redirected.
 */
import { test, expect } from '@playwright/test'

test('am: /admin/trash redirects away (not admin role)', async ({ page }) => {
  const res = await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  // Admin layout redirects non-admins to /dashboard.
  const finalUrl = page.url()
  expect(finalUrl).not.toContain('/admin/trash')
  expect(finalUrl).toMatch(/\/dashboard/)
})
