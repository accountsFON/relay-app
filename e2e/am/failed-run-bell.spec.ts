/**
 * Failed run in bell. After T12 stripped failed runs out of the
 * InFlightRunsPill, they show up exclusively in the notification bell as
 * FailedRunRow with inline Retry / Dismiss buttons.
 *
 * The seed helper mints a fresh ContentRun + run_failed ActivityEvent +
 * Mention on the AM persona so the bell row appears immediately, without
 * waiting for the 20s heartbeat to catch up.
 *
 * Retry path: triggers `retryFailedRunAction`, which soft-deletes the old
 * run + spawns a new one. The original failed mention drops from the bell
 * because the underlying run is archived. The button shows "Retrying…"
 * while the action resolves.
 *
 * Dismiss path: `acknowledgeFailedRunAction` sets acknowledgedAt on the
 * run. The Mention row remains until markRead fires onActionComplete, then
 * the row clears optimistically.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 16, spec 3 of 3
 */
import { test, expect } from '@playwright/test'
import { failedRunFor } from '../fixtures/seed-helpers'

test.describe('failed run in bell (am)', () => {
  // Serial because each test seeds its own failed run + mention. Running in
  // parallel would let three failed-run rows accumulate in the bell at the
  // same time, blowing up strict-mode locators that target "the" Retry /
  // Dismiss button.
  test.describe.configure({ mode: 'serial' })

  test('failed run appears in bell with Retry + Dismiss', async ({ page }) => {
    const { cleanup } = await failedRunFor()
    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // 25s timeout because the notification-bell empty-state test runs
      // in parallel and may briefly mark Morgan's unreads read while it
      // executes (it restores them in its finally block). The bell may
      // therefore flash through "0 unread" before our seeded failed-run
      // row + restored seed unreads land back in the count.
      const bell = page
        .getByRole('button', { name: /Notifications, [1-9]\d* unread/i })
        .first()
      await expect(bell).toBeVisible({ timeout: 25_000 })
      await bell.click()

      const panel = page.locator('#notification-dropdown:visible')

      // FailedRunRow renders summary copy from notification-copy.ts case
      // 'run_failed': "<month> content generation failed for <client>."
      // Scope to the visible dropdown — the mobile + desktop dropdowns
      // share state via NotificationProvider so both DOM trees would
      // match without scoping.
      await expect(panel.getByText(/content generation failed/i)).toBeVisible()

      // FailedRunActions renders two buttons labelled "Retry" + "Dismiss"
      // (no "failed run" qualifier — the bell row carries that context).
      await expect(panel.getByRole('button', { name: /^Retry$/ })).toBeVisible()
      await expect(panel.getByRole('button', { name: /^Dismiss$/ })).toBeVisible()
    } finally {
      await cleanup()
    }
  })

  test('Dismiss path: row clears, no nav', async ({ page }) => {
    const { cleanup } = await failedRunFor()
    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      const urlBefore = page.url()

      // 25s wait absorbs the parallel notification-bell empty-state
      // test that may briefly mark Morgan's unreads read.
      const bell = page
        .getByRole('button', { name: /Notifications, [1-9]\d* unread/i })
        .first()
      await expect(bell).toBeVisible({ timeout: 25_000 })
      await bell.click()
      const panel = page.locator('#notification-dropdown:visible')
      await panel.getByRole('button', { name: /^Dismiss$/ }).click()

      // FailedRunActions optimistically calls onDismissed -> markRead which
      // removes the item from the dropdown state. The row should clear
      // within the action's await of acknowledgeFailedRunAction. Using a
      // count check because the dropdown may close + reopen, breaking a
      // strict locator chained off `panel`.
      await expect(
        page.locator('#notification-dropdown:visible').getByText(/content generation failed/i),
      ).toHaveCount(0, { timeout: 10_000 })
      expect(page.url()).toBe(urlBefore)
    } finally {
      await cleanup()
    }
  })

  test('Retry path: button transitions to pending, row clears on success', async ({ page }) => {
    const { cleanup } = await failedRunFor()
    try {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // 25s wait absorbs the parallel notification-bell empty-state
      // test that may briefly mark Morgan's unreads read.
      const bell = page
        .getByRole('button', { name: /Notifications, [1-9]\d* unread/i })
        .first()
      await expect(bell).toBeVisible({ timeout: 25_000 })
      await bell.click()
      const panel = page.locator('#notification-dropdown:visible')
      await panel.getByRole('button', { name: /^Retry$/ }).click()

      // The Retry button text shifts to "Retrying…" while the server
      // action awaits triggerGeneration. The exact label is owned by
      // FailedRunActions; just assert disabled or pending text.
      await expect(panel.getByRole('button', { name: /Retrying/i })).toBeVisible({
        timeout: 5_000,
      })

      // After success the underlying run is archived; the bell row drops
      // because the source ActivityEvent is also gone (cascade on the
      // archived run). 15s budget for the trigger call to settle.
      // The dropdown may close after the action completes, so we scope
      // the wait to all #notification-dropdown nodes regardless of
      // visibility.
      await expect(
        page.locator('#notification-dropdown').getByText(/content generation failed/i),
      ).toHaveCount(0, { timeout: 15_000 })
    } finally {
      await cleanup()
    }
  })
})
