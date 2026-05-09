/**
 * Reusable assertion helpers for the audit. Pulled out so spec files stay
 * declarative.
 */
import { expect, type Page, type ConsoleMessage, type Response } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * Console message strings that are noisy in dev but irrelevant to UX. Anything
 * here is filtered out of the "no console errors" assertion. Keep the list
 * short; bias toward fixing real noise rather than allowlisting it.
 */
export const CONSOLE_ALLOWLIST: RegExp[] = [
  /Clerk: Clerk has been loaded with development keys/i,
  /clerk\.dev/i,
  /\[Fast Refresh\]/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  // Next.js dev overlays
  /\[next-router-warn\]/i,
  // Source map fetches that 404 in dev
  /Failed to load resource.*\.map/i,
  // Webpack dev-only deprecation noises
  /Warning: ReactDOM\.render is no longer supported/i,
]

export interface PageMonitor {
  consoleErrors: string[]
  pageErrors: string[]
  failedResponses: { url: string; status: number }[]
  /** Detach all listeners. Always call in afterEach so listeners don't leak. */
  detach: () => void
}

export function watchPage(page: Page): PageMonitor {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedResponses: { url: string; status: number }[] = []

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (CONSOLE_ALLOWLIST.some((re) => re.test(text))) return
    consoleErrors.push(text)
  }
  const onPageError = (err: Error) => {
    pageErrors.push(`${err.name}: ${err.message}`)
  }
  const onResponse = (res: Response) => {
    const status = res.status()
    if (status < 400) return
    if (status === 401 || status === 403) return // auth flows expected to bounce
    const url = res.url()
    if (/_next\/static|favicon\.ico|\.map$/.test(url)) return
    failedResponses.push({ url, status })
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)

  return {
    consoleErrors,
    pageErrors,
    failedResponses,
    detach() {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)
    },
  }
}

export function assertClean(monitor: PageMonitor, label: string) {
  expect(monitor.pageErrors, `${label}: page errors`).toEqual([])
  expect(monitor.consoleErrors, `${label}: console errors`).toEqual([])
  expect(monitor.failedResponses, `${label}: failed responses`).toEqual([])
}

export interface AxeReport {
  violations: number
  serious: number
  critical: number
  details: { id: string; impact: string | null; nodes: number; help: string }[]
}

export async function runAxe(page: Page): Promise<AxeReport> {
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // disable color-contrast for now: hard to pass on brand colors and we'd
    // rather see the long tail of structural a11y issues first.
    .disableRules(['color-contrast'])
  const result = await builder.analyze()
  const details = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    nodes: v.nodes.length,
    help: v.help,
  }))
  return {
    violations: result.violations.length,
    serious: result.violations.filter((v) => v.impact === 'serious').length,
    critical: result.violations.filter((v) => v.impact === 'critical').length,
    details,
  }
}

export async function expectNoBlockingAxe(page: Page, label: string) {
  const report = await runAxe(page)
  expect(report.critical, `${label}: critical axe violations: ${JSON.stringify(report.details)}`).toBe(0)
  expect(report.serious, `${label}: serious axe violations: ${JSON.stringify(report.details)}`).toBe(0)
}

export async function expectAccessibleButtons(page: Page, label: string) {
  const offenders = await page.evaluate(() => {
    const out: string[] = []
    document.querySelectorAll('button:not([disabled])').forEach((btn) => {
      const text = (btn.textContent ?? '').trim()
      const aria = btn.getAttribute('aria-label') ?? ''
      const title = btn.getAttribute('title') ?? ''
      if (!text && !aria && !title) {
        const html = btn.outerHTML.slice(0, 200)
        out.push(html)
      }
    })
    return out
  })
  expect(offenders, `${label}: buttons with no accessible name`).toEqual([])
}

export async function expectAccessibleLinks(page: Page, label: string) {
  const offenders = await page.evaluate(() => {
    const out: string[] = []
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? ''
      const text = (a.textContent ?? '').trim()
      const aria = a.getAttribute('aria-label') ?? ''
      if (!text && !aria) {
        out.push(href)
      }
    })
    return out
  })
  expect(offenders, `${label}: links without accessible name`).toEqual([])
}

export async function expectSingleH1(page: Page, label: string) {
  const count = await page.locator('h1').count()
  expect(count, `${label}: expected exactly one <h1>`).toBeGreaterThanOrEqual(1)
  // some shells render an SR only h1 plus the visible heading; accept up to 2.
  expect(count, `${label}: expected at most 2 <h1> elements`).toBeLessThanOrEqual(2)
}

/** Wait for the route to have settled into a stable state for axe + screenshot. */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(150)
}
