/**
 * Post version history surface. The seed plants 6/7/47 versions on three
 * reference posts.
 *
 * NOTE: As of the batch-page-nav overhaul (Task 7), /runs/[runId] redirects to
 * /batches/[batchId]. Version history is now surfaced on the batch page rather
 * than the legacy run-detail page. This spec navigates via the batch page.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test.use({ storageState: '.auth/am.json' })

test('post version history toggle is reachable on the batch page', async ({ page }) => {
  const seed = readSeedData()
  if (seed.postsWithVersions.length === 0) {
    test.skip(true, 'no posts with versions in seed')
  }
  const post = seed.postsWithVersions[0]
  // Find the client ID for that post (use clientName -> ID map).
  const clientId = (() => {
    if (post.clientName === seed.clients.cedarCreekDental.name) return seed.clients.cedarCreekDental.id
    if (post.clientName === seed.clients.apexPlumbing.name) return seed.clients.apexPlumbing.id
    if (post.clientName === seed.clients.sunriseYoga.name) return seed.clients.sunriseYoga.id
    return null
  })()
  if (!clientId) test.skip(true, `unknown client ${post.clientName}`)

  // /runs/[runId] now redirects to /batches/[batchId]; follow the redirect
  // so we land on the batch page that absorbed the run-detail surface.
  const oldUrl = `/clients/${clientId}/runs/${post.runId}`
  await page.goto(oldUrl)
  await page.waitForLoadState('networkidle')

  // Confirm we landed on the batch page (redirect resolved).
  await expect(page).toHaveURL(/\/batches\//, { timeout: 5_000 })

  // The version history toggle should appear as a "X versions" button or link.
  const versionToggle = page.locator('button, a').filter({ hasText: /\d+\s+versions?/i }).first()
  await expect(versionToggle).toBeVisible()
})
