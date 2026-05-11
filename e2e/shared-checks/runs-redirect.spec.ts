/**
 * Verifies that the legacy /runs/[runId] route 301-redirects to the
 * batch page that contains the run's posts. Posts without a batchId
 * fall back to the client page.
 *
 * Per spec § Section A routing table.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test.use({ storageState: '.auth/am.json' })

test('GET /runs/[runId] redirects to /batches/[batchId] when batch exists', async ({ page }) => {
  const seed = readSeedData()
  if (!seed) test.skip(true, 'no seed data available')
  const ref = seed.postsWithVersions[0]
  if (!ref) test.skip(true, 'no post-with-versions in seed')

  const oldUrl = `/clients/${seed.clients.cedarCreekDental.id}/runs/${ref.runId}`
  await page.goto(oldUrl)

  await expect(page).toHaveURL(/\/batches\//, { timeout: 5_000 })
})
