/**
 * Post version history surface. The seed plants 6/7/47 versions on three
 * reference posts.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test.use({ storageState: '.auth/am.json' })

test('post version history toggle is reachable on a run detail page', async ({ page }) => {
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

  await page.goto(`/clients/${clientId}/runs/${post.runId}`)
  await page.waitForLoadState('networkidle')

  // The version history toggle should appear as a "X versions" button or link.
  const versionToggle = page.locator('button, a').filter({ hasText: /\d+\s+versions?/i }).first()
  await expect(versionToggle).toBeVisible()
})
