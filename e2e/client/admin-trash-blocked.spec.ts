/**
 * Route guard: client role cannot reach /admin/trash.
 *
 * The admin layout checks can(ctx, 'admin.portal') and redirects to
 * /dashboard when the check fails. This spec confirms client is redirected.
 */
import { test, expect } from '@playwright/test'

test('client: /admin/trash redirects away (not admin role)', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  const finalUrl = page.url()
  expect(finalUrl).not.toContain('/admin/trash')
  // Client role may land on /dashboard or /inbox depending on their default
  // route. Either way they must not be on /admin/trash.
  expect(finalUrl).not.toContain('/admin')
})
