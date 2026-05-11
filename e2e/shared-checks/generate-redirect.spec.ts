/**
 * Verifies that the legacy /generate route 301-redirects to the client page.
 * Per spec § Section A routing table.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test.use({ storageState: '.auth/am.json' })

test('GET /generate redirects to client page', async ({ page }) => {
  const seed = readSeedData()
  if (!seed) test.skip(true, 'no seed data available')

  const oldUrl = `/clients/${seed.clients.cedarCreekDental.id}/generate`
  await page.goto(oldUrl)

  await expect(page).toHaveURL(`/clients/${seed.clients.cedarCreekDental.id}`)
})
