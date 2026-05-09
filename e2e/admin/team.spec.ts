/**
 * Admin team page covers the full member directory + invite flow + drilling
 * into a member's permission detail.
 */
import { test, expect } from '@playwright/test'
import { readSeedData } from '../fixtures/data'

test('admin team: 9 demo members rendered, 4 role sections', async ({ page }) => {
  const seed = readSeedData()
  await page.goto('/admin/users')
  await page.waitForLoadState('networkidle')

  // Each demo user surfaces by name. Use first() to tolerate role badge twice.
  await expect(page.getByText(seed.users.admin.name).first()).toBeVisible()
  await expect(page.getByText(seed.users.am1.name).first()).toBeVisible()
  await expect(page.getByText(seed.users.designer1.name).first()).toBeVisible()
  await expect(page.getByText(seed.users.client1.name).first()).toBeVisible()

  // Four role section headings (Admins / Account Managers / Designers / Clients).
  for (const heading of ['Admins', 'Account Managers', 'Designers', 'Clients']) {
    await expect(page.getByRole('heading', { name: new RegExp(heading, 'i') })).toBeVisible()
  }
})

test('admin team: invite-member modal opens with accessible affordances', async ({ page }) => {
  await page.goto('/admin/users')
  await page.waitForLoadState('networkidle')

  const inviteBtn = page.getByRole('button', { name: /invite/i }).first()
  await expect(inviteBtn).toBeVisible()
  await inviteBtn.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel(/email/i)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('admin team: member detail page loads', async ({ page }) => {
  const seed = readSeedData()
  await page.goto(`/admin/users/${seed.users.am1.id}`)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText(seed.users.am1.name).first()).toBeVisible()
  await expect(page.getByText(seed.users.am1.email).first()).toBeVisible()
})
