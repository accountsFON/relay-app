/**
 * Consistent screenshot helpers. All audit screenshots land under
 * e2e/__screenshots__/<persona>/<route>/<viewport>.png so diffs across runs
 * are deterministic by file path, not test name.
 */
import type { Page } from '@playwright/test'

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, label: 'desktop' },
  tablet: { width: 768, height: 1024, label: 'tablet' },
  mobile: { width: 390, height: 844, label: 'mobile' },
} as const

export type ViewportKey = keyof typeof VIEWPORTS

export async function captureViewports(
  page: Page,
  routeLabel: string,
  persona: string,
  saveScreenshot: (path: string, opts?: { fullPage?: boolean }) => Promise<void>,
) {
  for (const key of Object.keys(VIEWPORTS) as ViewportKey[]) {
    const v = VIEWPORTS[key]
    await page.setViewportSize({ width: v.width, height: v.height })
    await page.waitForTimeout(150)
    const filePath = `e2e/__screenshots__/${persona}/${routeLabel}/${v.label}.png`
    await saveScreenshot(filePath, { fullPage: true })
  }
}
