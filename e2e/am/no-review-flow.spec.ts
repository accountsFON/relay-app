/**
 * No review client smoke. Verifies the feature flag actually changes what
 * the AM sees in the browser end to end:
 *
 *  - RelayTrack on a no review batch shows 9 visible nodes (not 13).
 *    The component renders both desktop and mobile layouts in the DOM
 *    simultaneously, so :visible filters to the layout the viewport
 *    actually shows.
 *  - The "Send review link" button is gated off on the batch detail page
 *    for batches whose snapshot says clientReviewEnabled = false.
 *  - The Preview link is unaffected — it is an internal AM QA tool.
 *  - The "Client Review" checkbox on the new client form is reachable,
 *    starts unchecked (default off), and toggles cleanly.
 *
 * Seed fixture: Lighthouse Family Law (idx 6) is the demo client flipped
 * to clientReviewEnabled = false in scripts/seed/clients.ts. Its Apr 2026
 * batch sits at `in_design`, step 3 of the no review track, which gives
 * us a live, mid flow batch to navigate to.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test.describe('no review client flow', () => {
  test('batch detail: 9 visible track nodes, no Send review link, Preview still present', async ({
    page,
  }) => {
    const seed = readSeedData()
    const clientId = seed.clients.lighthouseFamilyLaw.id
    const batchId = seed.noReviewBatchId
    test.skip(!batchId, 'no no review batch resolved in the seed')

    // Lock the viewport to desktop so the desktop RelayTrack layout is
    // the one Tailwind's md: breakpoint exposes. Without this the test
    // is brittle to the project default viewport.
    await page.setViewportSize({ width: 1280, height: 800 })

    await page.goto(`/clients/${clientId}/batches/${batchId}`)
    await page.waitForLoadState('networkidle')

    // Don't false fail if the AM persona happens to lack access on a
    // given seed run (the audit suite has precedent for this — see
    // batch-detail.spec.ts).
    const url = page.url()
    if (url.includes('/no-access') || url.includes('/dashboard')) {
      test.skip(true, 'am persona cannot view this batch in the current seed')
    }

    // 9 visible nodes — the no review track. Both layouts render to the
    // DOM, so we filter by :visible to the one Tailwind shows.
    const visibleNodes = page.locator('[data-testid="relay-track-node"]:visible')
    await expect(visibleNodes).toHaveCount(9)

    // Send review link button is gated by batch.clientReviewEnabled on
    // the page action bar (Task 8). It must not render.
    await expect(page.getByTestId('send-link-button')).toHaveCount(0)

    // Preview link is internal AM QA and is not gated. First() because
    // the page may render the link in multiple action surfaces.
    await expect(page.getByTestId('batch-preview-link').first()).toBeVisible()
  })

  test('new client form: Client Review checkbox toggles', async ({ page }) => {
    await page.goto('/clients/new')
    await page.waitForLoadState('networkidle')

    const checkbox = page.locator('#clientReviewEnabled')
    await expect(checkbox).toBeVisible()
    // The Client model's default is false (Rule from Task 1), so the
    // new client form should render unchecked.
    await expect(checkbox).not.toBeChecked()

    await checkbox.click()
    await expect(checkbox).toBeChecked()

    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
  })
})
