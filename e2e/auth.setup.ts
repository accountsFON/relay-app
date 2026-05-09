/**
 * One time auth bootstrap. Signs each of the 5 audit personas in via Clerk
 * and writes storage state to .auth/<persona>.json so persona projects load
 * a pre signed in browser context instead of running the sign in flow per
 * spec.
 *
 * Also calls resolveSeedData() once so .auth/seed-data.json is fresh.
 */
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { PERSONAS } from './fixtures/personas'
import { resolveSeedData } from './fixtures/data'

const AUTH_DIR = path.join(process.cwd(), '.auth')

setup.beforeAll(async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true })
  await clerkSetup({
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  })
})

setup('resolve seed data', async () => {
  const data = await resolveSeedData()
  console.log(`[setup] resolved seed: org=${data.org.id} batches across ${Object.keys(data.batchByStep).length} steps`)
})

for (const persona of PERSONAS) {
  setup(`auth ${persona.name}`, async ({ page }) => {
    await setupClerkTestingToken({ page })
    await page.goto('/sign-in')
    await page.waitForLoadState('networkidle')

    // Email based sign in uses Clerk's backend API to mint a one time ticket,
    // bypassing the password breach check that fires on the password strategy.
    await clerk.signIn({ page, emailAddress: persona.email })

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard|\/no-access|\/onboarding|\/pending/, { timeout: 15_000 })

    await page.context().storageState({ path: path.join(AUTH_DIR, `${persona.name}.json`) })
  })
}
