/**
 * Notification bell — AM persona. Verifies that the HeaderBell shows the
 * unread badge, opens its dropdown, and that clicking a row navigates to the
 * event's deep link with the `#comment-<eventId>` hash + decrements the
 * badge. The empty-state copy fires when the user has zero unread.
 *
 * The bell mounts inside `<NotificationProvider>` in `src/components/app-shell.tsx`
 * and reads `/api/notifications/summary` on mount + every 20s. For tests we
 * trigger an immediate fetch via tab focus changes rather than waiting on
 * the poll, but the poll-driven timing is still budgeted in the heartbeat
 * specs (preview-submit, failed-run-bell).
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 16, spec 1 of 3
 */
import { test, expect } from '@playwright/test'
import {
  markAllUnreadReadForAm,
  restoreUnreadForMentions,
} from '../fixtures/seed-helpers'

test.describe('notification bell (am)', () => {
  // Serial because the empty-state test mutates Morgan's unread state for
  // the duration of its run. Running in parallel would race the other
  // specs in the file into seeing countBefore=0 + skipping prematurely.
  test.describe.configure({ mode: 'serial' })

  // Safety net: restore Morgan's seed unread mentions after every test
  // in this file, regardless of pass/fail. Without this, a hard worker
  // crash (e.g. on a Playwright internal timeout) leaves the seed in a
  // poisoned state for subsequent runs. Restoring kind='comment' rows
  // (the demo seed plants only comment-kind mentions for Morgan) is
  // idempotent — already-unread rows stay unread.
  test.afterEach(async () => {
    const { restoreSeedUnreadForAm } = await import('../fixtures/seed-helpers')
    await restoreSeedUnreadForAm()
  })

  test('shows badge with unread count', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/i })
    await expect(bell).toBeVisible()
  })

  test('opens dropdown and shows See all link', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/i })
    await bell.click()
    await expect(
      page.getByRole('link', { name: /See all in inbox/i }),
    ).toBeVisible()
  })

  test('clicking a row navigates to deep link with hash + decrements badge', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/i })
    const badgeBefore = await bell.getAttribute('aria-label')
    const countBefore = parseInt(badgeBefore?.match(/\d+/)?.[0] ?? '0', 10)
    test.skip(countBefore === 0, 'no unread mentions to test with, requires fresh seed')

    await bell.click()

    // Wait for the dropdown to be open + populated.
    const panel = page.locator('#notification-dropdown:visible')
    await expect(panel).toBeVisible()

    // First NotificationRow (skips FailedRunRow which uses a Link, not a
    // button-with-unread-dot). Two dropdowns exist in the DOM (mobile +
    // desktop, see app-shell.tsx) and both flip isOpen together via
    // shared NotificationProvider state; :visible scopes us to the
    // viewport-active one.
    const firstRow = panel
      .locator('button:has([data-testid="unread-dot"])')
      .first()
    await expect(firstRow).toBeVisible()
    await firstRow.click()

    // Deep link contract: `${href}#comment-${eventId}` from notification-row.tsx.
    // The path component depends on the event payload (batchId -> /batches/,
    // runId -> /runs/ -> redirects, neither -> /clients/), but the hash is
    // always present after a successful navigation.
    await page.waitForURL(/#comment-/, { timeout: 10_000 })
    expect(page.url()).toMatch(/#comment-/)

    // After markRead, the bell's aria-label drops by exactly one.
    await expect(bell).toHaveAttribute(
      'aria-label',
      new RegExp(`Notifications, ${countBefore - 1} unread`),
    )
  })

  test('empty state when no unread', async ({ page }) => {
    // Set baseline: mark every unread for the AM read in the DB.
    const restored = await markAllUnreadReadForAm()
    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const bell = page.getByRole('button', { name: /Notifications, 0 unread/i })
      await expect(bell).toBeVisible()
      await bell.click()
      // Scope to the visible dropdown so we don't match the /inbox
      // empty-state copy that may also be on the page (mobile inbox shell).
      // Two #notification-dropdown nodes exist (mobile + desktop) and
      // share open state via context, so :visible picks the right one.
      await expect(
        page.locator('#notification-dropdown:visible').getByText(/all caught up/i),
      ).toBeVisible()
    } finally {
      await restoreUnreadForMentions(restored)
    }
  })
})
