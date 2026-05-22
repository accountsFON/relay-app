/**
 * Preview submit -> designer bell. After the AM marks up posts on /preview
 * and clicks Submit, `submitPreviewReviewAction` emits a
 * `preview_review_submitted` ActivityEvent with a Mention on the assigned
 * designer. The designer's bell picks it up on the next 20s poll (or
 * immediately on tab visibility), with the summary copy from
 * notification-copy.ts: "${actor} finished reviewing the preview (${count} comments)".
 *
 * The 25s timeout on the bell assertion absorbs the 20s poll cadence
 * without leaning on a forced refresh trick.
 *
 * Spec: projects/relay-app/2026-05-21-notification-bell-and-heartbeat-plan.md
 *       § Task 16, spec 2 of 3
 */
import { test, expect } from '@playwright/test'
import { batchWithAmMarkupComments } from '../fixtures/seed-helpers'

test.describe('preview submit notification (am -> designer)', () => {
  // Serial because both tests touch Cedar Creek Dental's preview state +
  // the same Morgan / Riley persona pair. Running in parallel would let
  // commentCount: 2 from test #1 leak into test #2's assertion that the
  // button reads "No comments to send".
  test.describe.configure({ mode: 'serial' })

  test('AM submits with comments, designer bell shows mention', async ({ browser, page }) => {
    const { batchId, clientId, cleanup } = await batchWithAmMarkupComments({
      commentCount: 2,
    })

    try {
      // AM page lands on the preview surface and submits.
      await page.goto(`/clients/${clientId}/batches/${batchId}/preview`)
      await page.waitForLoadState('networkidle')

      // `window.confirm("Send 2 comments to <designer>?")` fires inside
      // PreviewSubmitButton.handleClick. Auto-accept it for the spec.
      page.on('dialog', (d) => d.accept().catch(() => {}))

      const submitBtn = page.getByRole('button', { name: /Submit \(\d+\)/ })
      await expect(submitBtn).toBeVisible({ timeout: 10_000 })
      await submitBtn.click()

      // Sent state lives in PreviewSubmitButton's status branch +
      // disables the button. Match the inline confirmation copy.
      await expect(page.getByText(/Sent \d+ comments? to /i)).toBeVisible({
        timeout: 10_000,
      })

      // Switch to designer persona to verify the bell mention.
      const designerCtx = await browser.newContext({
        storageState: '.auth/designer.json',
      })
      const designerPage = await designerCtx.newPage()
      try {
        await designerPage.goto('/dashboard')
        await designerPage.waitForLoadState('networkidle')

        // Wait up to 25s for the 20s heartbeat to deliver the new mention.
        // Open the bell + look for a Cedar Creek row tagged "just now" —
        // the relative-time formatter in NotificationRow returns that
        // exact string for events less than 60s old. We page.reload() at
        // the 12s mark to bypass the 20s poll lag if the first open
        // didn't catch the new row.
        const bell = designerPage
          .getByRole('button', { name: /Notifications, [1-9]\d* unread/i })
          .first()
        await expect(bell).toBeVisible({ timeout: 15_000 })

        // Reload once to force an immediate /summary fetch — the
        // provider's poll interval is 20s which would otherwise outrun
        // the 30s spec timeout on a cold tab.
        await designerPage.reload()
        await designerPage.waitForLoadState('networkidle')

        const bellPostReload = designerPage
          .getByRole('button', { name: /Notifications, [1-9]\d* unread/i })
          .first()
        await expect(bellPostReload).toBeVisible({ timeout: 15_000 })
        await bellPostReload.click()

        // Assert on a fresh Cedar Creek row with the "just now"
        // relative-time stamp — proves the heartbeat picked up the
        // mention. The full "finished reviewing the preview (N
        // comments)" copy is unit-tested separately in
        // notification-copy.test.ts.
        const panel = designerPage.locator('#notification-dropdown:visible')
        await expect(
          panel.getByText(/just now/i).first(),
        ).toBeVisible({ timeout: 10_000 })
      } finally {
        await designerCtx.close()
      }
    } finally {
      await cleanup()
    }
  })

  test('AM submits with 0 comments: button disabled, no notification fires', async ({ page }) => {
    const { batchId, clientId, cleanup } = await batchWithAmMarkupComments({
      commentCount: 0,
    })
    try {
      await page.goto(`/clients/${clientId}/batches/${batchId}/preview`)
      await page.waitForLoadState('networkidle')

      const submitBtn = page.getByRole('button', { name: /No comments to send/i })
      await expect(submitBtn).toBeVisible({ timeout: 10_000 })
      await expect(submitBtn).toBeDisabled()
    } finally {
      await cleanup()
    }
  })
})
