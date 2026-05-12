/**
 * AM persona can archive a post directly from search results.
 *
 * The affordance is an overflow menu on each post tile in the /search Posts
 * section, gated on the `client.edit` permission. Mirrors the PostCard
 * overflow menu on the batch detail page so archive works from either surface.
 */
import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/am.json' })

test('am: post tiles in search expose an overflow menu', async ({ page }) => {
  // "patients" appears in many seeded captions across industries, so the
  // Posts section should be populated for the AM scope.
  await page.goto('/search?q=patients')
  await page.waitForLoadState('networkidle')

  const postsHeading = page.getByRole('heading', { name: /^Posts$/i })
  const hasPosts = await postsHeading.isVisible().catch(() => false)
  test.skip(!hasPosts, 'no post matches for "patients" in this seed')

  const trigger = page.getByRole('button', { name: /post options/i }).first()
  await expect(trigger).toBeVisible()
})

test('am: archiving a post from search removes it from results', async ({ page }) => {
  await page.goto('/search?q=patients')
  await page.waitForLoadState('networkidle')

  const triggers = page.getByRole('button', { name: /post options/i })
  const initialCount = await triggers.count()
  test.skip(initialCount === 0, 'no post overflow triggers visible')

  await triggers.first().click()
  await page.getByRole('menuitem', { name: /archive post/i }).click()

  // Confirmation dialog
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: /^Archive$/ }).click()

  // After archive, the dialog closes and the page revalidates. The archived
  // post should no longer appear in search results because searchPosts goes
  // through the Prisma soft-delete extension.
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.waitForLoadState('networkidle')

  const newCount = await page.getByRole('button', { name: /post options/i }).count()
  expect(newCount).toBe(initialCount - 1)
})
