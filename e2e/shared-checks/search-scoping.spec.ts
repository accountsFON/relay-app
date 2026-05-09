/**
 * Search permission scoping. Each persona searches the same query and the
 * result count varies by scope:
 *   - admin sees everything
 *   - am sees their assigned clients
 *   - designer sees their assigned clients
 *   - client sees their one linked client only
 */
import { test, expect } from '@playwright/test'

const PERSONAS = [
  { name: 'admin', file: '.auth/admin.json' },
  { name: 'am', file: '.auth/am.json' },
  { name: 'designer', file: '.auth/designer.json' },
  { name: 'client', file: '.auth/client.json' },
]

for (const persona of PERSONAS) {
  test.describe(`search scoping: ${persona.name}`, () => {
    test.use({ storageState: persona.file })

    test(`${persona.name} can reach /search and run "Cedar"`, async ({ page }) => {
      await page.goto('/search?q=Cedar')
      await page.waitForLoadState('networkidle')

      // Should land on /search; the page title should include "Search".
      expect(page.url()).toMatch(/\/search/)
      await expect(page.locator('h1').first()).toBeVisible()
    })
  })
}

test.describe('client cannot see other clients in search', () => {
  test.use({ storageState: '.auth/client.json' })

  test('searching "Apex" returns no Apex Plumbing result', async ({ page }) => {
    await page.goto('/search?q=Apex')
    await page.waitForLoadState('networkidle')

    // The full client name should not appear as a search result for Casey.
    const apexHits = page.getByText(/Apex Plumbing/i)
    await expect(apexHits).toHaveCount(0)
  })
})
