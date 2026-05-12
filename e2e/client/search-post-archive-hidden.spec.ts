/**
 * Client persona does NOT see the post-archive overflow menu in search.
 *
 * The affordance is gated on `client.edit`. Clients have `client.view` but
 * not `client.edit`, so the overflow trigger must not render.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/client.json' })

test('client: post tiles in search have no overflow menu', async ({ page }) => {
  await page.goto('/search?q=patients')
  await page.waitForLoadState('networkidle')

  // If the client persona has any post hits in their linked-client scope,
  // none of them should expose the archive trigger.
  const triggers = page.getByRole('button', { name: /post options/i })
  await expect(triggers).toHaveCount(0)
})
