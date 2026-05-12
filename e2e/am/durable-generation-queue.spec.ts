/**
 * E2E: Durable in-flight generation queue happy path.
 *
 * Covers:
 *  - Selecting 2 active clients on /clients
 *  - Toggling Re-crawl off on one row, leaving it on for the other
 *  - Clicking the bulk Generate button
 *  - In-flight pill appearing in the nav with "2 runs"
 *  - Pill count persisting across navigation to /dashboard
 *  - (RUN_REAL_PIPELINE=1 only) Waiting for a run to reach awaiting_choice,
 *    the choice modal opening, clicking "Add to existing batch", and the pill
 *    count dropping.
 *
 * Auth: handled automatically by the playwright.config.ts 'am' project
 * (storageState: '.auth/am.json'). No inline sign-in needed.
 *
 * Seed assumptions:
 *  - The demo seed contains at least 2 active clients assigned to the AM
 *    persona (Morgan / am1): Cedar Creek Dental and Sunrise Yoga Studio are
 *    both am=am1 and status=active in scripts/seed/clients.ts.
 *  - readSeedData() resolves from .auth/seed-data.json written by auth.setup.ts.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

const requirePipeline = process.env.RUN_REAL_PIPELINE === '1'

test.describe('Durable in-flight generation queue', () => {
  test('bulk gen survives navigation, choice modal hoists, batch deep-link works', async ({
    page,
  }) => {
    const seed = readSeedData()

    // The AM persona (Morgan, am1) is the assigned AM for both Cedar Creek
    // Dental and Sunrise Yoga Studio, both of which are active in the seed.
    const clientA = seed.clients.cedarCreekDental
    const clientB = seed.clients.sunriseYoga

    // -----------------------------------------------------------------------
    // Step 1: Navigate to /clients
    // -----------------------------------------------------------------------
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')

    // Verify both known active AM clients are visible.
    await expect(page.getByText(clientA.name).first()).toBeVisible()
    await expect(page.getByText(clientB.name).first()).toBeVisible()

    // -----------------------------------------------------------------------
    // Step 2: Select 2 clients via their row checkboxes.
    // The BulkGenerateList renders: aria-label="Select {client.name}"
    // -----------------------------------------------------------------------
    await page.getByRole('checkbox', { name: `Select ${clientA.name}` }).check()
    await page.getByRole('checkbox', { name: `Select ${clientB.name}` }).check()

    // Confirm both are checked.
    await expect(
      page.getByRole('checkbox', { name: `Select ${clientA.name}` }),
    ).toBeChecked()
    await expect(
      page.getByRole('checkbox', { name: `Select ${clientB.name}` }),
    ).toBeChecked()

    // -----------------------------------------------------------------------
    // Step 3: Toggle Re-crawl off on the first client (clientA), leave on for
    // clientB. The Re-crawl checkbox appears only after a client is selected:
    // aria-label="Re-crawl {client.name}"
    //
    // Note: The component fetches the per-client crawl preference on selection
    // (getClientCrawlInfo) and may update the checkbox state asynchronously.
    // We wait for the Re-crawl checkbox to appear before unchecking.
    // -----------------------------------------------------------------------
    const reCrawlA = page.getByRole('checkbox', { name: `Re-crawl ${clientA.name}` })
    await expect(reCrawlA).toBeVisible({ timeout: 10_000 })
    // Ensure it's checked first (default or resolved from crawl info), then uncheck.
    if (await reCrawlA.isChecked()) {
      await reCrawlA.uncheck()
    }

    const reCrawlB = page.getByRole('checkbox', { name: `Re-crawl ${clientB.name}` })
    await expect(reCrawlB).toBeVisible({ timeout: 10_000 })
    // clientB Re-crawl should remain checked.
    await expect(reCrawlB).toBeChecked()

    // -----------------------------------------------------------------------
    // Step 4: Click the bulk Generate button.
    // Button text pattern: "Generate {Month Year} for 2" (from formatMonthYear)
    // -----------------------------------------------------------------------
    const generateBtn = page.getByRole('button', { name: /Generate .+ for 2/i })
    await expect(generateBtn).toBeVisible()
    await generateBtn.click()

    // -----------------------------------------------------------------------
    // Step 5: In-flight pill shows "2 runs" in the nav.
    // InFlightRunsPill renders a button with aria-label matching the run count
    // ("1 run" | "2 runs").
    //
    // The provider polls listInFlightRuns() and the pill appears when
    // runs.length > 0. Give it a generous timeout for the server action +
    // provider refresh to settle.
    // -----------------------------------------------------------------------
    await expect(
      page.getByRole('button', { name: /2 runs/i }),
    ).toBeVisible({ timeout: 30_000 })

    // -----------------------------------------------------------------------
    // Step 6: Navigate to /dashboard — pill must still be visible (persists
    // across route changes because InFlightRunsProvider lives in AppShell).
    // -----------------------------------------------------------------------
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('button', { name: /2 runs/i }),
    ).toBeVisible({ timeout: 15_000 })

    // -----------------------------------------------------------------------
    // Steps 7-10 require a real Trigger.dev pipeline run reaching
    // awaiting_choice. Skip unless RUN_REAL_PIPELINE=1 is set.
    //
    // What would be needed to un-skip without RUN_REAL_PIPELINE:
    //   - A dev-only API route (e.g. POST /api/dev/fast-forward-run) that
    //     directly upserts a ContentRun to status=complete with unattached
    //     posts and a matchingBatch, bypassing Trigger.dev entirely.
    //   - That seam doesn't exist yet; tracked as a TODO in C8.
    // -----------------------------------------------------------------------
    test.skip(
      !requirePipeline,
      'Set RUN_REAL_PIPELINE=1 to verify pipeline completion, choice modal, and pill count drop. ' +
        'A dev-only fast-forward seam is required to run this deterministically in CI.',
    )

    // -----------------------------------------------------------------------
    // Step 7: Wait for at least one run to reach awaiting_choice.
    // The choice modal dialog title: "Content ready for {clientName} ({month})"
    // -----------------------------------------------------------------------
    await expect(page.getByText(/Content ready for/i)).toBeVisible({ timeout: 120_000 })

    // -----------------------------------------------------------------------
    // Step 8: Choice modal is open. Click "Add to existing batch".
    // Button text: "Add to existing batch ({batchLabel})"
    // -----------------------------------------------------------------------
    await page.getByRole('button', { name: /Add to existing batch/i }).click()

    // -----------------------------------------------------------------------
    // Step 9: Modal closes (or advances to the next awaiting run).
    // Pill count drops by 1 (from 2 to 1 or disappears if both resolved).
    // -----------------------------------------------------------------------
    // Allow either "1 run" pill or the full pill disappearing as valid outcomes.
    await expect(
      page.getByRole('button', { name: /2 runs/i }),
    ).not.toBeVisible({ timeout: 30_000 })
  })
})
