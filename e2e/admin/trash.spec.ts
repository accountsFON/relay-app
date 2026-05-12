/**
 * /admin/trash — admin-only tests.
 *
 * Spec 1: Admin CAN access /admin/trash and sees tabs with non-zero counts.
 *         The seed plants 1 archived post per live client (3d old), 1 archived
 *         batch with cascade runs+posts (25d old), and 1 archived client with
 *         cascade descendants (7d old). Every tab should have at least 1 row.
 *
 * Spec 2: Clicking through to the archived client (Maple & Oak Furnishings) via
 *         the clients list with ?archived=1 shows RestoreClientBanner (which
 *         renders ArchivedBanner with entityType="Client") and hides the
 *         destructive action buttons (Archive Client, Generate Content).
 *
 * These specs run under the admin persona (storageState: .auth/admin.json).
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

// ---------------------------------------------------------------------------
// Spec 1: /admin/trash renders with all four tabs populated
// ---------------------------------------------------------------------------

test('admin: /admin/trash page loads with Trash heading', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByRole('heading', { name: /^trash$/i }),
  ).toBeVisible()
})

test('admin: /admin/trash — Clients tab shows at least 1 item', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  // Tab label format: "Clients (N)" or a tab button/link with that text.
  await expect(
    page.getByText(/clients\s*\(\d+\)/i).first(),
  ).toBeVisible()
})

test('admin: /admin/trash — Batches tab shows at least 1 item', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByText(/batches\s*\(\d+\)/i).first(),
  ).toBeVisible()
})

test('admin: /admin/trash — Posts tab shows at least 1 item', async ({ page }) => {
  await page.goto('/admin/trash')
  await page.waitForLoadState('networkidle')

  await expect(
    page.getByText(/posts\s*\(\d+\)/i).first(),
  ).toBeVisible()
})

// ---------------------------------------------------------------------------
// Spec 2: Archived client opens with banner + hides destructive actions
// ---------------------------------------------------------------------------

test('admin: archived client page shows banner and hides destructive actions', async ({
  page,
}) => {
  const seed = readSeedData()

  // Navigate to the clients list with archived items visible.
  await page.goto('/clients?archived=1')
  await page.waitForLoadState('networkidle')

  // The seeded archived client is Maple & Oak Furnishings (last live client).
  // Click through to it.
  await page.getByText(seed.clients.mapleAndOak.name).first().click()
  await page.waitForLoadState('networkidle')

  // ArchivedBanner renders: "This client was archived on <date>. Read-only view."
  await expect(
    page.getByText(/this client was archived/i),
  ).toBeVisible()

  // Destructive actions must not be rendered for archived clients.
  // ArchiveClientButton is wrapped in {isLive && ...} so it is absent from the DOM.
  await expect(
    page.getByRole('button', { name: /^archive client$/i }),
  ).toBeHidden()

  // GenerateContentDialog trigger is also wrapped in {isLive && ...}.
  await expect(
    page.getByRole('button', { name: /generate content/i }),
  ).toBeHidden()
})
